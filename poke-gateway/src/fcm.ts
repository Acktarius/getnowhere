/** FCM HTTP v1 adapter. Notification payload is fixed; no data keys. @see docs/features/peer-wake-notification.md */

import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";
import { PushConfigError, type PushResult } from "./apns.js";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

type ServiceAccount = { project_id?: string };

let auth: GoogleAuth | undefined;
let projectId: string | undefined;

function loadClient(): { auth: GoogleAuth; projectId: string } {
  if (auth && projectId) return { auth, projectId };
  const keyFile = process.env.FCM_SERVICE_ACCOUNT_PATH;
  if (!keyFile) throw new PushConfigError("fcm");
  const sa = JSON.parse(readFileSync(keyFile, "utf8")) as ServiceAccount;
  if (!sa.project_id) throw new PushConfigError("fcm");
  projectId = sa.project_id;
  auth = new GoogleAuth({ keyFile, scopes: [SCOPE] });
  return { auth, projectId };
}

export async function sendFcm(token: string): Promise<PushResult> {
  const { auth: client, projectId: id } = loadClient();
  const accessToken = await client.getAccessToken();
  if (!accessToken) throw new PushConfigError("fcm");

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${id}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: "Get NowHere", body: "New message" },
        },
      }),
    },
  );

  if (res.ok) return { ok: true };
  try {
    const body = (await res.json()) as {
      error?: { status?: string; details?: { errorCode?: string }[] };
    };
    const status = body?.error?.status ?? "";
    const code = body?.error?.details?.[0]?.errorCode ?? "";
    if (status === "UNREGISTERED" || code === "UNREGISTERED") {
      return { ok: false, unregistered: true };
    }
  } catch {
    /* unparseable — treat as generic failure */
  }
  return { ok: false, unregistered: false };
}
