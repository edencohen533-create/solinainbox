import { InvalidWebhookError } from "@/lib/validation/whatsapp-webhook";
import { NextResponse } from "next/server";
import { getActiveProvider } from "@/server/providers/provider-registry";

/**
 * Meta's webhook verification handshake, run once when you register the
 * callback URL in the Meta App dashboard (WhatsApp → Configuration).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const provider = await getActiveProvider();
  const result = provider.verifyWebhookChallenge(mode, token, challenge);

  if (result === null) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }
  return new NextResponse(result, { status: 200 });
}

/**
 * Inbound messages and delivery/read status updates from Meta. Verifies the
 * request signature, then hands the payload to the active provider, which
 * calls messageService.createInboundMessage() — the same function the mock
 * provider's Demo Simulator uses.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const provider = await getActiveProvider();

  if (!provider.verifyWebhook(request.headers, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try { await provider.receiveWebhook(payload); }
  catch (error) {
    if (error instanceof InvalidWebhookError) return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    throw error;
  }

  // Meta requires a fast 200 response, or it will retry the same webhook.
  return NextResponse.json({ ok: true });
}
