import type { Metadata } from "next";
import AssistantRuntime from "./AssistantRuntime";

export const metadata: Metadata = {
  title: "私人 AI 助理",
  description: "站内 AI 助理（DeepSeek）：对话、记忆与设置只保存在本机浏览器。",
};

export default function AssistantPage() {
  return <AssistantRuntime />;
}
