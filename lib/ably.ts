import Ably from "ably";

type AblyPayload = Record<string, unknown>;

let restClient: Ably.Rest | null = null;

function getApiKey() {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    throw new Error("ABLY_API_KEY is not configured");
  }
  return apiKey;
}

export function getAblyRestClient() {
  if (!restClient) {
    restClient = new Ably.Rest(getApiKey());
  }
  return restClient;
}

export async function publishAblyEvent(
  channelName: string,
  name: string,
  data: AblyPayload
) {
  const client = getAblyRestClient();
  const channel = client.channels.get(channelName);
  await channel.publish(name, data);
}

export async function createAblyTokenRequest(clientId: string) {
  const client = getAblyRestClient();
  return client.auth.createTokenRequest({ clientId });
}
