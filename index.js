"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const core = require("@actions/core");
const { IncomingWebhook } = require("@slack/webhook");
const axios = require("axios").default || require("axios");
const qs = require("querystring");

function normalizeCookie(raw) {
  if (!raw) return "";
  let s = String(raw);

  // 앞뒤 공백 + 개행 제거
  s = s.trim().replace(/[\r\n]+/g, "");

  // 'Cookie:' 라벨을 실수로 붙여넣은 경우 제거
  s = s.replace(/^cookie\s*:\s*/i, "");

  // 양끝 따옴표/대괄호 제거
  s = s.replace(/^["'\[]+/, "").replace(/["'\]]+$/, "");

  // 세미콜론 뒤 공백 표준화
  s = s.replace(/;\s*/g, "; ").replace(/\s{2,}/g, " ");

  // 헤더에 허용되지 않는 비ASCII 문자 제거(보이지 않는 NBSP 등)
  s = s.replace(/[^\x20-\x7E]+/g, "");
  return s;
}

(async () => {
  const [productId, scheduleId, seatId, webhookUrl] = [
    "product-id",
    "schedule-id",
    "seat-id",
    "slack-incoming-webhook-url",
  ].map((name) => {
    const v = core.getInput(name);
    if (!v) throw new Error(`melon-ticket-actions: Please set ${name} input parameter`);
    return v;
  });

  const message = core.getInput("message") || "티켓사세요";
  const webhook = new IncomingWebhook(webhookUrl);

  const cookie = normalizeCookie(process.env.MELON_COOKIE || "");

  const payload = qs.stringify({
    prodId: productId,
    scheduleNo: scheduleId,
    seatId,
    volume: 1,
    selectedGradeVolume: 1,
  });

  const headers = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Origin": "https://ticket.melon.com",
    "Referer": `https://ticket.melon.com/performance/index.htm?prodId=${productId}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Host": "ticket.melon.com",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    ...(cookie ? { Cookie: cookie } : {}),
  };

  const res = await axios({
    method: "POST",
    url: "https://ticket.melon.com/tktapi/product/seatStateInfo.json",
    params: { v: "1" },
    data: payload,
    headers,
    timeout: 15000,
    validateStatus: () => true,
  });

  console.log("Seat API status:", res.status);
  if (res.status !== 200) {
    const bodySnippet =
      typeof res.data === "string" ? res.data.slice(0, 300) : JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Seat API HTTP ${res.status}. Body: ${bodySnippet}`);
  }

  if (res.data && res.data.chkResult) {
    const link = `https://ticket.melon.com/performance/index.htm?${qs.stringify({ prodId: productId })}`;
    await webhook.send(`${message} ${link}`);
    console.log("Slack sent");
  } else {
    console.log("No available seats (chkResult is falsy).");
  }
})().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  core.setFailed(e && e.message ? e.message : String(e));
});
