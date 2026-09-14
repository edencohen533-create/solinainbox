import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ConversationSource, MessageStatus, MessageType } from "@prisma/client";
import { createInboundMessage } from "@/server/services/message-service";
import { normalizePhone } from "@/lib/phone";
import type {
  MessageStatusResult,
  OutboundMessagePayload,
  SendResult,
  WhatsAppProvider,
} from "./whatsapp-provider";

export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  webhookVerifyToken: string;
  appSecret?: string;
  apiVersion?: string;
}

const META_TYPE_TO_MESSAGE_TYPE: Record<string, MessageType> = {
  text: MessageType.TEXT,
  image: MessageType.IMAGE,
  video: MessageType.VIDEO,
  audio: MessageType.AUDIO,
  document: MessageType.DOCUMENT,
};

const META_STATUS_TO_MESSAGE_STATUS: Record<string, MessageStatus> = {
  sent: MessageStatus.SENT,
  delivered: MessageStatus.DELIVERED,
  read: MessageStatus.READ,
  failed: MessageStatus.FAILED,
};

/**
 * Real Meta WhatsApp Cloud API integration. Activated by setting a
 * ProviderCredential row with provider="meta_whatsapp_cloud_api" and
 * isActive=true (see Settings → חיבור וואטסאפ). Implements the same
 * WhatsAppProvider interface as the mock, so no calling code changes.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  constructor(private readonly config: MetaWhatsAppConfig) {}

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.config.apiVersion ?? "v21.0"}/${this.config.phoneNumberId}`;
  }

  private toE164Digits(phone: string): string {
    return phone.replace(/^\+/, "");
  }

  private async post(path: string, body: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async sendMessage(payload: OutboundMessagePayload): Promise<SendResult> {
    const to = this.toE164Digits(payload.to);
    let body: Record<string, unknown>;

    switch (payload.type) {
      case "IMAGE":
        body = { messaging_product: "whatsapp", to, type: "image", image: { link: payload.mediaUrl } };
        break;
      case "VIDEO":
        body = { messaging_product: "whatsapp", to, type: "video", video: { link: payload.mediaUrl } };
        break;
      case "AUDIO":
        body = { messaging_product: "whatsapp", to, type: "audio", audio: { link: payload.mediaUrl } };
        break;
      case "DOCUMENT":
        body = { messaging_product: "whatsapp", to, type: "document", document: { link: payload.mediaUrl } };
        break;
      default:
        body = { messaging_product: "whatsapp", to, type: "text", text: { body: payload.body ?? "" } };
    }

    const { ok, data } = await this.post("/messages", body);
    if (!ok) {
      return { providerMessageId: "", status: "FAILED", error: data?.error?.message ?? "Meta API error" };
    }
    return { providerMessageId: data?.messages?.[0]?.id ?? "", status: "SENT" };
  }

  async sendTemplate(payload: OutboundMessagePayload): Promise<SendResult> {
    if (!payload.templateId) {
      return { providerMessageId: "", status: "FAILED", error: "templateId is required to send a template" };
    }

    const template = await prisma.template.findUnique({ where: { id: payload.templateId } });
    if (!template) {
      return { providerMessageId: "", status: "FAILED", error: "Template not found" };
    }

    const to = this.toE164Digits(payload.to);
    const parameters = Object.values(payload.templateVariables ?? {}).map((value) => ({
      type: "text",
      text: value,
    }));

    const { ok, data } = await this.post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(parameters.length > 0 ? { components: [{ type: "body", parameters }] } : {}),
      },
    });

    if (!ok) {
      return { providerMessageId: "", status: "FAILED", error: data?.error?.message ?? "Meta API error" };
    }
    return { providerMessageId: data?.messages?.[0]?.id ?? "", status: "SENT" };
  }

  async uploadMedia(file: Buffer, mimeType: string): Promise<{ mediaUrl: string }> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([new Uint8Array(file)], { type: mimeType }));

    const res = await fetch(`${this.baseUrl}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message ?? "Meta media upload failed");
    }
    // Meta returns an internal media ID here, not a public URL — a real
    // send call references it via `{ id: mediaId }` instead of `{ link }`.
    // Kept as a known simplification: send flows in this app use `link`
    // (mediaUrl on the Message/attachment), so wiring up ID-based media
    // sends is the one piece left for full media support.
    return { mediaUrl: data.id };
  }

  async getMessageStatus(): Promise<MessageStatusResult> {
    // Meta has no pull endpoint for message status — it arrives via the
    // "statuses" webhook events, handled in receiveWebhook() below.
    return { status: "SENT" };
  }

  verifyWebhook(headers: Headers, rawBody: string): boolean {
    if (!this.config.appSecret) {
      // No app secret configured — can't verify signatures. Accept but log,
      // rather than hard-blocking a webhook someone hasn't fully set up.
      console.warn("[meta-whatsapp] appSecret not configured; skipping webhook signature verification");
      return true;
    }

    const signatureHeader = headers.get("x-hub-signature-256");
    if (!signatureHeader) return false;

    const expected =
      "sha256=" + crypto.createHmac("sha256", this.config.appSecret).update(rawBody, "utf8").digest("hex");

    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  verifyWebhookChallenge(mode: string | null, token: string | null, challenge: string | null): string | null {
    if (mode === "subscribe" && token === this.config.webhookVerifyToken) {
      return challenge;
    }
    return null;
  }

  async receiveWebhook(payload: unknown): Promise<void> {
    const body = payload as MetaWebhookPayload;

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value) continue;

        for (const message of value.messages ?? []) {
          await this.handleInboundMessage(message, value.contacts?.[0]?.profile?.name);
        }
        for (const status of value.statuses ?? []) {
          await this.handleStatusUpdate(status);
        }
      }
    }
  }

  private async handleInboundMessage(message: MetaInboundMessage, contactName: string | undefined) {
    const phone = normalizePhone(`+${message.from}`) ?? `+${message.from}`;

    let contact = await prisma.contact.findUnique({ where: { phone } });
    if (!contact) {
      contact = await prisma.contact.create({
        data: { name: contactName ?? phone, phone, source: "whatsapp" },
      });
    }

    const type = META_TYPE_TO_MESSAGE_TYPE[message.type] ?? MessageType.TEXT;
    const text =
      message.text?.body ??
      message.image?.caption ??
      message.video?.caption ??
      message.document?.caption ??
      `[${message.type}]`;

    await createInboundMessage({
      contactId: contact.id,
      body: text,
      type,
      source: ConversationSource.WHATSAPP,
    });
  }

  private async handleStatusUpdate(status: MetaStatusUpdate) {
    const mappedStatus = META_STATUS_TO_MESSAGE_STATUS[status.status];
    if (!mappedStatus) return;

    const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();

    await prisma.message.updateMany({
      where: { providerMessageId: status.id },
      data: {
        status: mappedStatus,
        ...(mappedStatus === MessageStatus.DELIVERED ? { deliveredAt: timestamp } : {}),
        ...(mappedStatus === MessageStatus.READ ? { readAt: timestamp } : {}),
      },
    });
  }
}

interface MetaInboundMessage {
  from: string;
  type: string;
  text?: { body: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
}

interface MetaStatusUpdate {
  id: string;
  status: string;
  timestamp?: string;
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: MetaInboundMessage[];
        statuses?: MetaStatusUpdate[];
        contacts?: Array<{ profile?: { name?: string } }>;
      };
    }>;
  }>;
}
