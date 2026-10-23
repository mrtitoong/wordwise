import type { ModelSpec, TokenUsage } from "./types";

/** Chi phí ước tính (USD) của một lượt gọi theo giá tham khảo trong MODEL_CATALOG. */
export function estimateCostUsd(model: Pick<ModelSpec, "priceUsdPerMTok">, usage: TokenUsage) {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return (input * model.priceUsdPerMTok.input + output * model.priceUsdPerMTok.output) / 1_000_000;
}
