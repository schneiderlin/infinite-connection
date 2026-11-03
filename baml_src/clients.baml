// MiniMax（OpenAI 兼容端点，MiniMax-M2）。需要在 .env 配置 MINIMAX_API_KEY。
client<llm> MiniMax {
  provider openai-generic
  retry_policy Exponential
  options {
    base_url "https://api.minimaxi.com/v1"
    api_key env.MINIMAX_API_KEY
    model "MiniMax-M3.1-Flash"
    // MiniMax 拒绝只有 system 消息的请求（报 chat content is empty），整体放进 user 消息。
    default_role "user"
  }
}

retry_policy Exponential {
  max_retries 2
  strategy {
    type exponential_backoff
    delay_ms 1000
    multiplier 2
    max_delay_ms 15000
  }
}
