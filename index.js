"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const core = require("@actions/core");
const { IncomingWebhook } = require("@slack/webhook");
const axios = require("axios").default || require("axios");
const qs = require("querystring");

(async () => {
  // ---- 입력값 검증 ----
  const [productId, scheduleId, seatId, webhookUrl] = [
    "product-id",
    "schedule-id",
    "seat-id",
    "slack-incoming-webhook-url",
  ].map((name) => {
    const value = core.getInput(name);
    if (!value) throw new Error(`melon-ticket-actions: Please set ${name} input parameter`);
    return value;
  });

  const message = core.getInput("message") || "티켓사세요";
  const webhook = new IncomingWebhook(webhookUrl);

  // ---- 멜론 좌석 상태 조회 ----
  const payload = qs.stringify({
    prodId: productId,
    scheduleNo: scheduleId,
    seatId,
    volume: 1,
    selectedGradeVolume: 1,
  });

  // 멜론이 요구하는 브라우저스러운 헤더들 (406 방지)
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
  };

  const res = await axios({
    method: "POST",
    url: "https://ticket.melon.com/tktapi/product/seatStateInfo.json",
    params: { v: "1" },
    data: payload,
    headers,
    timeout: 15000,
    // 상태코드가 200이 아니어도 일단 반환받아 우리가 처리
    validateStatus: () => true,
  });

  console.log("Seat API status:", res.status);
  if (res.status !== 200) {
    // 본문 앞부분도 찍어서 디버그 도움
    const bodySnippet =
      typeof res.data === "string"
        ? res.data.slice(0, 300)
        : JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Seat API HTTP ${res.status}. Body: ${bodySnippet}`);
  }

  console.log(
    "Got response:",
    typeof res.data === "string" ? res.data.slice(0, 300) : JSON.stringify(res.data).slice(0, 300)
  );

  // ---- 좌석 가능 시 Slack 알림 ----
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
