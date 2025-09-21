"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const core = require("@actions/core");
const { IncomingWebhook } = require("@slack/webhook");
const axios = require("axios").default || require("axios");
const qs = require("querystring");

function normalizeCookie(raw) {
  if (!raw) return "";
  let s = String(raw);
  s = s.trim().replace(/[\r\n]+/g, "");            // 개행 제거
  s = s.replace(/^cookie\s*:\s*/i, "");            // 'Cookie:' 라벨 제거
  s = s.replace(/^["'\[]+/, "").replace(/["'\]]+$/, ""); // 감싸는 따옴표/대괄호 제거
  s = s.replace(/;\s*/g, "; ").replace(/\s{2,}/g, " ");  // 공백 정리
  s = s.replace(/[^\x20-\x7E]+/g, "");             // 비ASCII 제거
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

  // 시크릿에서 가져온 쿠키
  const cookie = normalizeCookie(process.env.MELON_COOKIE || "");

  // 좌석 팝업(onestop) URL을 기본 Referer로 사용 (필요 시 환경변수로 덮어쓰기 가능)
  const popupReferer =
    process.env.MELON_REFERER ||
    `https://ticket.melon.com/reservation/popup/onestop.htm?prodId=${encodeURIComponent(
      productId
    )}&scheduleNo=${encodeURIComponent(scheduleId)}`;

  const payload = qs.stringify({
    prodId: productId,
    scheduleNo: scheduleId,
    seatId,                    // 예: ST0001 / R001 / 1_0 등
    volume: 1,
    selectedGradeVolume: 1,
  });

  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Origin: "https://ticket.melon.com",
    Referer: popupReferer,              // 🔑 팝업 페이지로 맞춤
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    Host: "ticket.melon.com",
    Connection: "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    // 브라우저에서 자동으로 붙는 sec-fetch 헤더 유사 값 (엄격하진 않지만 도움됨)
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
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
      typeof res.data === "string"
        ? res.data.slice(0, 300)
        : JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Seat API HTTP ${res.status}. Body: ${bodySnippet}`);
  }

  // 좌석 가능 시 Slack 알림
  if (res.data && res.data.chkResult) {
    const link = `https://ticket.melon.com/performance/index.htm?${qs.stringify({
      prodId: productId,
    })}`;
    await webhook.send(`${message} ${link}`);
    console.log("Slack sent");
  } else {
    console.log("No available seats (chkResult is falsy).");
  }
})().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  core.setFailed(e && e.message ? e.message : String(e));
});
