import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRfc2822MimeMessage,
  classifyEdgeFunctionError,
  evaluateProviderDelivery,
  redactSensitiveText,
  resolveConfiguredEmailProvider,
  validateEmailList,
  validateRecipientEmail,
} from "./emailPayload.ts";

describe("Email Validation, MIME Construction, & Honest Delivery Checks", () => {
  it("Validates recipient emails and rejects malformed or header-injected inputs", () => {
    assert.equal(validateRecipientEmail("student@nationalcollege.edu").valid, true);
    assert.equal(validateRecipientEmail("  User@Example.COM ").normalizedEmail, "user@example.com");
    assert.equal(validateRecipientEmail("").valid, false);
    assert.equal(validateRecipientEmail("not-an-email").valid, false);
    assert.equal(validateRecipientEmail("bad\r\nBcc: attacker@evil.com").valid, false);

    const listCheck = validateEmailList("a@b.com, c@d.org");
    assert.equal(listCheck.valid, true);
    assert.deepEqual(listCheck.list, ["a@b.com", "c@d.org"]);
    assert.equal(validateEmailList("a@b.com, bad-email").valid, false);
  });

  it("Builds RFC 2822 multipart/mixed MIME with base64 PDF attachment and UTF-8 subject", () => {
    const fakePdfB64 = Buffer.from("%PDF-1.4\n%SupernovaTicket\n%%EOF").toString("base64");
    const mime = buildRfc2822MimeMessage({
      from: "Supernova 3.0 <animationthenationalcollege@gmail.com>",
      to: "visitor@example.com",
      subject: "Supernova 3.0 — Visitor Pass (SN3-26-000123)",
      bodyHtml: "<p>Welcome to Supernova 3.0!</p>",
      attachments: [
        {
          filename: "SN3-26-000123_Visitor_Pass.pdf",
          contentType: "application/pdf",
          base64Content: `data:application/pdf;base64,${fakePdfB64}`,
        },
      ],
    });

    assert.match(mime, /^From: Supernova 3\.0 <animationthenationalcollege@gmail\.com>/m);
    assert.match(mime, /^To: visitor@example\.com/m);
    assert.match(mime, /^Subject: =\?utf-8\?B\?/m);
    assert.match(mime, /Content-Type: multipart\/mixed; boundary="supernova_mixed_/);
    assert.match(mime, /Content-Type: application\/pdf; name="SN3-26-000123_Visitor_Pass\.pdf"/);
    assert.match(mime, /Content-Disposition: attachment; filename="SN3-26-000123_Visitor_Pass\.pdf"/);
    assert.ok(mime.includes(fakePdfB64));
  });

  it("Never marks simulated, 404, 503, or messageId-less responses as sent", () => {
    assert.equal(
      evaluateProviderDelivery({ httpOk: false, statusCode: 404, error: "NOT_FOUND" }).delivered,
      false
    );
    assert.equal(
      evaluateProviderDelivery({ httpOk: true, statusCode: 200, okFlag: true, simulated: true }).delivered,
      false
    );
    assert.equal(
      evaluateProviderDelivery({ httpOk: true, statusCode: 200, okFlag: true, messageId: null }).delivered,
      false
    );

    const okRes = evaluateProviderDelivery({
      httpOk: true,
      statusCode: 200,
      okFlag: true,
      simulated: false,
      messageId: "194a8b1234567890",
    });
    assert.equal(okRes.delivered, true);
    assert.equal(okRes.status, "sent");
  });

  it("Redacts OAuth tokens, refresh tokens, JWTs, and API keys from logs", () => {
    const dirty = "Failed with access_token=ya29.a0AfH6SM_secret123 and refresh_token=1//0gSecretRefresh and key=re_abc123456789012 Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def";
    const clean = redactSensitiveText(dirty);
    assert.equal(clean.includes("ya29.a0AfH6SM_secret123"), false);
    assert.equal(clean.includes("1//0gSecretRefresh"), false);
    assert.equal(clean.includes("re_abc123456789012"), false);
    assert.equal(clean.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), false);
    assert.match(clean, /\[REDACTED/);
  });

  it("Distinguishes FunctionsFetchError, FunctionsRelayError, and FunctionsHttpError with HTTP status", () => {
    const fetch404 = classifyEdgeFunctionError({
      errorName: "FunctionsFetchError",
      errorMessage: "Failed to send a request to the Edge Function",
      functionName: "send-registration-confirmation",
      probeStatus: 404,
      probeCode: "NOT_FOUND",
    });
    assert.equal(fetch404.errorType, "FunctionsFetchError");
    assert.equal(fetch404.httpStatusCode, 404);
    assert.match(fetch404.message, /not deployed on Supabase/i);

    const fetchNet = classifyEdgeFunctionError({
      errorName: "FunctionsFetchError",
      errorMessage: "Failed to send a request to the Edge Function",
      functionName: "send-registration-confirmation",
    });
    assert.equal(fetchNet.errorType, "FunctionsFetchError");
    assert.match(fetchNet.message, /FunctionsFetchError/);

    const relayErr = classifyEdgeFunctionError({
      errorName: "FunctionsRelayError",
      errorMessage: "Relay Error invoking the Edge Function",
      httpStatus: 502,
      functionName: "send-registration-confirmation",
    });
    assert.equal(relayErr.errorType, "FunctionsRelayError");
    assert.equal(relayErr.httpStatusCode, 502);
    assert.match(relayErr.message, /Relay Error/i);

    const httpErr = classifyEdgeFunctionError({
      errorName: "FunctionsHttpError",
      errorMessage: "Edge Function returned a non-2xx status code",
      httpStatus: 503,
      bodyError: "Gmail OAuth secrets missing",
      functionName: "send-registration-confirmation",
    });
    assert.equal(httpErr.errorType, "FunctionsHttpError");
    assert.equal(httpErr.httpStatusCode, 503);
    assert.match(httpErr.message, /HTTP 503: Gmail OAuth secrets missing/);
  });

  it("Resolves configured email provider without silently substituting Resend when Gmail is intended", () => {
    assert.equal(
      resolveConfiguredEmailProvider({ explicitProvider: "", hasGmailCreds: false, hasResendKey: false }),
      "gmail"
    );
    assert.equal(
      resolveConfiguredEmailProvider({ explicitProvider: "gmail", hasGmailCreds: false, hasResendKey: true }),
      "gmail"
    );
    assert.equal(
      resolveConfiguredEmailProvider({ explicitProvider: "resend", hasGmailCreds: true, hasResendKey: true }),
      "resend"
    );
    assert.equal(
      resolveConfiguredEmailProvider({ explicitProvider: "", hasGmailCreds: true, hasResendKey: true }),
      "gmail"
    );
    assert.equal(
      resolveConfiguredEmailProvider({ explicitProvider: "", hasGmailCreds: false, hasResendKey: true }),
      "resend"
    );
  });
});

