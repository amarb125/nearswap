import { config } from "./config";

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const c = config();
  const text = `${code} is your ${c.APP_NAME} login code. It expires in 5 minutes. Never share it with anyone.`;
  switch (c.SMS_PROVIDER) {
    case "console":
      console.log(`[sms:console] to=${phone} code=${code}`);
      return;
    case "twilio": {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phone, From: c.TWILIO_FROM ?? "", Body: text }),
      });
      if (!res.ok) throw new Error(`Twilio SMS failed: ${res.status} ${await res.text()}`);
      return;
    }
    case "msg91": {
      // MSG91 OTP template API (India, DLT-compliant). Template must contain ##OTP##.
      const res = await fetch("https://control.msg91.com/api/v5/otp?" + new URLSearchParams({
        template_id: c.MSG91_TEMPLATE_ID ?? "",
        mobile: phone.replace(/^\+/, ""),
        otp: code,
      }), { method: "POST", headers: { authkey: c.MSG91_AUTH_KEY ?? "", "Content-Type": "application/json" } });
      if (!res.ok) throw new Error(`MSG91 SMS failed: ${res.status} ${await res.text()}`);
      return;
    }
  }
}
