export const dynamic = "force-dynamic";

export async function GET() {
  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  const turnUrl = process.env.TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(",").map((u) => u.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return Response.json({ iceServers });
}
