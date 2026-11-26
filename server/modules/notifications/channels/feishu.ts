import crypto from "node:crypto";
import type { ChannelConfig, NotificationLevel, NotificationMessage } from "../contracts";
import { levelLabel } from "../format";
import {
  DeliveryError,
  requestWithTimeout,
  safeText,
  stringValue,
} from "../transport";

const HEADER_TEMPLATE: Record<NotificationLevel, "blue" | "orange" | "red"> = {
  info: "blue",
  warning: "orange",
  critical: "red",
};

/**
 * 飞书群自定义机器人签名算法：
 * 以 `timestamp + "\n" + secret` 作为 HMAC-SHA256 密钥，对空串求摘要并 Base64 编码。
 */
export function computeFeishuSign(timestamp: string, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac("sha256", stringToSign).update("").digest("base64");
}

function formatFeishuCard(message: NotificationMessage, secret?: string) {
  const elements: Array<Record<string, unknown>> = [];

  const metaLine = `**级别**：${levelLabel(message.level)}　|　**事件**：\`${message.eventKey}\`　|　**时间**：${message.timestamp}`;
  elements.push({
    tag: "div",
    text: {
      tag: "lark_md",
      content: message.body ? `${metaLine}\n\n${message.body}` : metaLine,
    },
  });

  if (message.fields.length > 0) {
    elements.push({
      tag: "div",
      fields: message.fields.map((f) => ({
        is_short: true,
        text: {
          tag: "lark_md",
          content: `**${f.label}**\n${f.value}`,
        },
      })),
    });
  }

  if (message.link) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "查看详情" },
          type: "primary",
          url: message.link,
        },
      ],
    });
  }

  const payload: Record<string, unknown> = {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: HEADER_TEMPLATE[message.level],
        title: {
          tag: "plain_text",
          content: message.title,
        },
      },
      elements,
    },
  };

  if (secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    payload.timestamp = timestamp;
    payload.sign = computeFeishuSign(timestamp, secret);
  }

  return payload;
}

/** POST interactive card to Feishu / Lark custom group bot webhook. */
export async function sendFeishu(
  config: ChannelConfig,
  message: NotificationMessage,
): Promise<void> {
  const url = stringValue(config, "url");
  if (!url) throw new DeliveryError("飞书机器人未配置 Webhook 地址");

  const secret = stringValue(config, "secret");
  const body = JSON.stringify(formatFeishuCard(message, secret || undefined));

  const response = await requestWithTimeout(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "JDF-Site-Alerts/1.0",
    },
    body,
  });

  const rawText = await safeText(response);
  if (!response.ok) {
    throw new DeliveryError(
      `飞书接口返回 ${response.status}${rawText ? `：${rawText}` : ""}`,
      {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      },
    );
  }

  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as {
        code?: number;
        StatusCode?: number;
        msg?: string;
        StatusMessage?: string;
      };
      const code = parsed.code ?? parsed.StatusCode ?? 0;
      if (code !== 0) {
        const msg = parsed.msg ?? parsed.StatusMessage ?? "未知错误";
        throw new DeliveryError(`飞书机器人返回错误（code ${code}）：${msg}`);
      }
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
    }
  }
}
