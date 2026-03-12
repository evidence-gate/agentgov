# Pitfalls Research

**Domain:** AI Agent Infrastructure Services (market research + go-to-market strategy)
**Researched:** 2026-03-13
**Confidence:** MEDIUM-HIGH (strong evidence from multiple industry sources, Gartner predictions, and real-world failure post-mortems)

## Critical Pitfalls

### Pitfall 1: Building on Shifting Protocol Foundations (MCP/A2A Platform Risk)

**What goes wrong:**
You invest 6-12 months building infrastructure tightly coupled to MCP v1.x or A2A v0.x. Then the spec changes. MCP v2.0 adds Streamable HTTP transport and OAuth 2.1 authentication. A2A v1.0 stabilizes with different assumptions. Your integration layer breaks. Worse, the Linux Foundation's Agentic AI Foundation (AAIF) -- where both MCP and A2A now live under joint governance of OpenAI, Anthropic, Google, Microsoft, AWS, and Block -- publishes a joint interoperability spec in Q3 2026 that obsoletes your abstraction layer entirely.

**Why it happens:**
The protocol ecosystem is moving at breakneck speed. MCP was donated to the Linux Foundation in December 2025. A2A v1.0 stable release is targeted for Q1 2026. A joint interoperability specification is expected Q3 2026. Builders treat early protocol versions as stable when they are explicitly pre-1.0 or rapidly evolving. Tool descriptions can change overnight without schema breaks and still completely alter agent behavior (the "mcpdiff" problem).

**How to avoid:**
- Abstract protocol interactions behind your own interface layer. Never expose MCP/A2A primitives directly in your API surface.
- Design for "protocol-agnostic" infrastructure. The value you provide (auth management, cost control, observability) should be independent of which protocol agents use to communicate.
- Track AAIF governance decisions and release cadences. Subscribe to the Linux Foundation's AAIF mailing list and GitHub repos.
- Build protocol adapters as swappable plugins, not core architecture. Budget 2-4 weeks of protocol migration work per major spec change.

**Warning signs:**
- Your codebase has deep imports from MCP/A2A SDK internals rather than stable public APIs
- You cannot describe your product's value without mentioning a specific protocol version
- Breaking changes in upstream protocol SDKs require more than 1 week of migration work
- The AAIF announces a joint spec that overlaps with your core abstraction

**Phase to address:**
Architecture design phase (Phase 1). Protocol abstraction must be a day-one architectural decision, not retrofitted.

**Confidence:** HIGH -- Protocol instability is well-documented. AAIF governance timeline is from official Linux Foundation roadmap.

---

### Pitfall 2: Solving a Problem the Big Players Will Absorb Within 12 Months

**What goes wrong:**
You build an MCP gateway, an agent observability dashboard, or an auth proxy. It works. You get early traction. Then Cloudflare ships MCP auth with OAuth 2.1 and Durable Objects for free. Or LangSmith adds the exact feature you built as a checkbox. Or AWS announces an agent gateway service at re:Invent. Your entire product becomes a feature in someone else's platform. The market for standalone MCP gateways is already crowding: MintlifyMCP (SOC 2 Type II certified), Cloudflare's agent infrastructure, Solo.io's AgentGateway, and multiple others.

**Why it happens:**
Infrastructure layers get absorbed by platforms. This is the historical pattern: load balancers became AWS ELB, container orchestration became managed Kubernetes, API gateways became Cloudflare Workers. AI agent infrastructure is on the same trajectory. The biggest players (Cloudflare, AWS, Google, Microsoft) are already building agent infrastructure. The observability space alone has 20+ platforms (Arize, LangSmith, Langfuse, Maxim AI, Braintrust, etc.) and Arize just raised $70M Series C.

**How to avoid:**
- Target problems that require deep domain knowledge or workflow-specific context that platform players cannot easily generalize. "Cost governance for multi-model agent systems" is more defensible than "MCP proxy."
- Build for a specific user persona rather than the abstract "AI developer." A cost control tool for indie agent builders has different defensibility than one for enterprises.
- Create data-network effects: the more agents use your system, the better it gets (e.g., anomaly detection that improves with more usage patterns, or community-curated tool registries).
- If your feature can be described in one sentence, a platform will clone it. If it requires a paragraph to explain the nuance, you have breathing room.

**Warning signs:**
- Cloudflare, Vercel, or AWS blog posts announce features that overlap with your roadmap
- Your pitch starts with "We do X but for AI agents" where X is an existing cloud service category
- Competitors are raising $50M+ rounds (they will commoditize the space faster than you can differentiate)
- Your product has no user-generated data or network effects after 6 months

**Phase to address:**
Market research phase (Phase 0 -- this project). The domain selection must account for platform absorption risk. Revisit quarterly during execution.

**Confidence:** HIGH -- Platform absorption of infrastructure is a well-established pattern. Cloudflare's MCP auth launch is documented fact.

---

### Pitfall 3: The "Too Early / Too Late" Timing Trap

**What goes wrong:**
Two failure modes. Too early: you build agent infrastructure when most "agents" are still glorified chatbots, and your TAM is too small to sustain a business. Too late: you wait for the market to mature, but by then the winners are established with network effects and integrations. Gartner predicts 40%+ of agentic AI projects will be canceled by end of 2027 due to escalating costs, unclear business value, or inadequate risk controls. Only ~130 of thousands of "agentic AI" vendors are real (rest are "agent washing").

**Why it happens:**
The AI agent market is in the "trough of disillusionment" phase for enterprise adoption. Task-specific AI agent adoption is predicted to jump from <5% in 2025 to 40% by end of 2026 (Gartner), but the gap between experimentation and production is vast. Only 1 in 10 companies that experimented with agents actually scaled them. The hype cycle creates noise that makes it hard to distinguish genuine demand signals from vendor marketing.

**How to avoid:**
- Target developers building agents TODAY, not enterprises evaluating agents for 2027. Individual developers and small teams are already shipping agents; enterprises are mostly running pilots.
- Validate demand with a free/open-source tool before committing to a paid product. Ship something useful in weeks, not months.
- Focus on problems that exist regardless of how "agentic" the AI is: API cost management, error handling, auth -- these matter whether the agent is truly autonomous or just a sophisticated pipeline.
- Track leading indicators: MCP SDK downloads (97M+ monthly as of March 2026), GitHub agent framework stars, developer community activity. Not Gartner hype cycle reports.

**Warning signs:**
- Your beta waitlist is full of enterprise "innovation leads" but no individual developers actually building things
- Potential customers say "interesting, we'll revisit when our agent strategy matures"
- You can only demonstrate value in demo scenarios, not real production workflows
- You are building for a market definition that does not exist yet ("autonomous agent economy")

**Phase to address:**
Validation phase (Phase 1). Build the smallest useful tool immediately. If developers use it unprompted, timing is right. If you need to explain why they should want it, timing may be off.

**Confidence:** HIGH -- Gartner 40% cancellation prediction is published. MCP download numbers are from official sources.

---

### Pitfall 4: Japan-Based Team Targeting Global Developer Market Without Native Presence

**What goes wrong:**
You build a technically excellent product but fail to gain traction because: (1) your English-language documentation, blog posts, and community interactions feel non-native and don't resonate with Silicon Valley developer culture; (2) you miss the "hallway track" at conferences, Twitter/X discourse, and real-time community dynamics that drive developer tool adoption; (3) Japanese business culture's consensus-driven, risk-averse approach conflicts with the "ship fast, break things" cadence required for developer tools; (4) timezone differences (JST is 16-17 hours ahead of PST) mean you are asleep during peak US developer activity.

**Why it happens:**
Developer tool adoption is fundamentally a community and trust problem. Developers choose tools based on: who built it (reputation), who else uses it (social proof), and how responsive the maintainers are (community). Japanese startups historically remain domestically oriented -- the cultural and linguistic barriers to global expansion are well-documented. English proficiency, while possible, is different from English-native developer communication style (the difference between grammatically correct and culturally resonant).

**How to avoid:**
- Follow the Patrick McKenzie model: build in Japan, market exclusively in English from day one. Never build a Japanese version first and "localize" later.
- Lead with open source. Code is universal. A well-documented, well-tested GitHub repo transcends language barriers. Let the code speak first, then build community around it.
- Invest in async-first community building: detailed documentation, GitHub Discussions, Discord with async norms. This turns the timezone disadvantage into an advantage (users wake up to thoughtful responses, not silence).
- Write in English but do not pretend to be a US company. Authenticity matters. Being a Japan-based team with meticulous engineering standards can be a differentiator, not a weakness.
- Consider hiring one US-based part-time developer advocate / community manager once you have initial traction.

**Warning signs:**
- GitHub stars are growing but issues/discussions are not (people bookmark but do not engage)
- Your blog posts get no Hacker News or Twitter/X engagement despite technical quality
- Users in Japan adopt but US/EU users do not
- Community questions go unanswered for >12 hours during US business hours

**Phase to address:**
Go-to-Market phase (Phase 2). The community strategy must be designed before launch, not improvised after. English-first documentation from Phase 1.

**Confidence:** MEDIUM-HIGH -- Patrick McKenzie's Japan-to-global strategy is well-documented. Japanese startup global expansion barriers are widely reported. Specific impact on developer tools is somewhat extrapolated.

---

### Pitfall 5: Monetization Model Mismatch -- Pricing What Nobody Will Pay For

**What goes wrong:**
You launch with usage-based pricing on something developers expect to be free (or free-tier). Or you gate features behind enterprise pricing when you have no enterprise sales motion. Or you price by API calls when the value is in uptime/reliability. The "renewal cliff" hits: 2025 pilot customers re-evaluate in 2026 and cannot justify the cost because ROI is "soft" (time saved, not revenue generated). Only 30% of AI companies have published quantifiable ROI in dollar terms.

**Why it happens:**
AI infrastructure pricing has no established benchmarks. Costs vary 300x between a simple query and a complex one. Developer tools have a well-known free-rider problem: the most passionate users (who drive word-of-mouth) are often individual developers who will not pay. Enterprise customers who will pay require sales teams, compliance certifications, and 6-month sales cycles that a small team cannot sustain. Open-core requires a team of sales engineers, account executives, and customer success reps to close enterprise deals.

**How to avoid:**
- Start with a generous free tier and a simple "team" paid tier. Do not launch with enterprise pricing.
- Price on value, not usage. "Never get a surprise API bill" (cost control) is worth more than "we proxy your MCP calls" (commodity).
- Study Langfuse's model: open source self-hosted is free, cloud-hosted is paid. This works for small teams because the product sells itself -- no enterprise sales needed initially.
- Delay monetization until you have clear signal on what users actually value. The first 6 months should be about adoption, not revenue.
- When you do monetize: outcome-based pricing (e.g., "cost saved" or "incidents prevented") is more defensible than seat-based or usage-based.

**Warning signs:**
- Users actively route around your paid features using the free tier
- Enterprise prospects ask for SOC 2 / ISO 27001 compliance before they will evaluate (you do not have it and cannot get it quickly)
- Your pricing page has more than 3 tiers before you have 100 paying customers
- Competitors offer similar functionality in their free tier

**Phase to address:**
Business model phase (Phase 2-3). Do not design pricing in Phase 1. Observe usage patterns first. Formalize pricing after 100+ active free users.

**Confidence:** MEDIUM -- Monetization patterns are well-documented for developer tools generally. AI-specific pricing benchmarks are scarce (this is the problem).

---

### Pitfall 6: The Recursive Cost Problem -- Your Infrastructure Costs Scale with Your Customers' Costs

**What goes wrong:**
If you build cost-control or observability infrastructure for AI agents, your own infrastructure costs scale proportionally to your customers' agent activity. An agent that runs 10x more LLM calls generates 10x more telemetry data for your observability system, 10x more auth token operations for your auth layer, 10x more cost-tracking events. Your margins shrink as customers succeed, creating an inverse scaling problem. The $47,000 recursive agent loop story is instructive: your cost-control service would have been the one ingesting all those runaway events.

**Why it happens:**
AI agent workloads are inherently unpredictable. A single agent can go from 10 API calls/minute to 10,000/minute if it enters a recursive loop. Unlike traditional SaaS where user actions are human-speed, agent actions are machine-speed. If you charge per-seat or flat-rate but your costs are usage-based, a single power user can destroy your unit economics.

**How to avoid:**
- Design your own cost structure to be sublinear to customer activity. Sampling, aggregation, and edge processing reduce the data you need to ingest.
- Implement hard rate limits in your own infrastructure from day one. Your system must be able to shed load gracefully.
- Align your pricing with your cost structure. If your costs scale with customer API calls, your pricing must too. Do not offer unlimited plans.
- Pre-compute and batch where possible. Real-time processing of every agent event is unnecessary and expensive.
- Set up your own cost alerts and circuit breakers. Eat your own dog food.

**Warning signs:**
- Your AWS/GCP bill grows faster than your revenue
- A single customer accounts for >30% of your infrastructure costs
- You cannot predict next month's infrastructure costs within 2x accuracy
- Your system has no rate limiting or backpressure mechanisms

**Phase to address:**
Architecture phase (Phase 1) for design decisions. Implementation in Phase 2. Pricing alignment in Phase 3.

**Confidence:** HIGH -- The $47,000 runaway agent cost story is documented. The inverse scaling problem is a well-known pattern in usage-based infrastructure businesses.

---

### Pitfall 7: Security as an Afterthought in a Trust-Critical Domain

**What goes wrong:**
You handle customers' API keys, OAuth tokens, or agent-to-service credentials. A breach exposes not just your users' data but their customers' data and their cloud provider credentials. In 2026, MCP security is being called "the AI-related security issue of the year." Tool poisoning, context injection, prompt injection via MCP tool descriptions, and overly permissive access tokens are active attack vectors. The EU AI Act's high-risk system requirements take full effect in August 2026.

**Why it happens:**
Speed-to-market pressure. Agent infrastructure startups ship fast to capture the market window but defer security hardening. The MCP ecosystem itself has security gaps: servers shipping without authentication, shared human credentials being used for agent access, static long-lived tokens granting overly broad access. If you build in this ecosystem, you inherit these systemic risks and your customers expect you to solve them -- but solving security properly is expensive and slow.

**How to avoid:**
- If you handle credentials: encrypt at rest, encrypt in transit, implement secret rotation, audit logging, and least-privilege access from day one. This is non-negotiable.
- If you build MCP-related infrastructure: require OAuth 2.1 with PKCE universally. Prefer short-lived, scoped tokens. Never store long-lived credentials in plaintext.
- Get SOC 2 Type I early (costs ~$20-50K, takes 3-6 months). This is table stakes for any infrastructure handling credentials.
- Track the EU AI Act timeline: August 2026 enforcement for high-risk systems. If your product touches enterprise decision-making workflows, you may be in scope.
- Implement supply-chain security for MCP tool registries. Tool description changes should trigger alerts (the mcpdiff approach).

**Warning signs:**
- You store API keys in environment variables or config files without encryption
- Your system has no audit trail for credential access
- You have not threat-modeled your MCP/A2A integration points
- Enterprise prospects ask about compliance certifications and you have nothing to show
- You are handling credentials but have no security incident response plan

**Phase to address:**
Phase 1 (architecture). Security architecture must be designed upfront. SOC 2 preparation starts in Phase 2. Full compliance by Phase 3.

**Confidence:** HIGH -- MCP security risks are extensively documented by CoSAI whitepaper, Red Hat, Veeam, and multiple security vendors. EU AI Act timeline is legislative fact.

---

### Pitfall 8: Choosing Breadth Over Depth and Becoming a "Jack of All Trades" Nobody Trusts

**What goes wrong:**
You try to build the "all-in-one agent infrastructure platform" covering auth + cost control + observability + error handling + testing. Each feature is 60% complete. Developers try it, find rough edges in every component, and choose specialized tools instead: Langfuse for observability, Portkey for cost control, Strata for auth. You have no best-in-class capability, no word-of-mouth driver, and no organic growth engine. Meanwhile, your maintenance burden grows with each half-finished feature.

**Why it happens:**
The project context lists 4 candidate infrastructure domains (auth, cost control, error handling, testing). The temptation is to address all of them because they are all genuine pain points. But a small team building across 4 domains simultaneously will produce mediocre results in all of them. The observability space alone has 20+ competing platforms. Each domain has well-funded incumbents or fast-moving startups.

**How to avoid:**
- Pick ONE domain. Be the absolute best at that one thing. "The cost control tool that prevents $47,000 surprise bills" is a clearer story than "the complete agent infrastructure platform."
- Build depth, not breadth. Deep integration with 3 agent frameworks beats shallow integration with 10.
- Only expand to a second domain after achieving clear product-market fit in the first (measured by: unprompted word-of-mouth referrals, >50% month-over-month retention, users actively requesting the second domain).
- Study how Stripe started with just payments before expanding to billing, identity, atlas, etc. Each expansion came after dominance in the previous domain.

**Warning signs:**
- Your roadmap has 4+ major feature domains planned for the first year
- Users describe your product as "it does a lot of things" rather than "it is the best at X"
- You spend more time on integration glue than on core value
- Feature requests span multiple unrelated domains

**Phase to address:**
Market research phase (Phase 0 -- this project). Domain selection is THE critical decision. Reassess at Phase 1 milestone.

**Confidence:** HIGH -- "Focus" as the primary success factor for small teams is universally supported by startup literature and the specific competitive landscape data for AI agent infrastructure.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-coding MCP SDK version and bypassing abstraction layer | Ship 2 weeks faster | Full rewrite when MCP v2.0 drops (Q1 2026 timeline) | Never -- protocol abstraction is a 2-day investment |
| Storing customer API keys in your database without HSM/KMS | Faster initial development | Single breach destroys trust and potentially the company | Never -- use cloud KMS from day one |
| Synchronous event processing for observability/telemetry | Simpler architecture | System cannot handle agent burst traffic (10,000x spike in recursive loops) | MVP only, with explicit migration plan and timeline |
| Single-region deployment | Lower infrastructure cost | 200ms+ latency for non-local users; agent workflows are latency-sensitive | First 6 months only, if primary user base is geographically concentrated |
| Skipping automated testing for protocol adapter layer | Faster iteration during protocol changes | Integration breaks go undetected when upstream changes; erodes trust | Never -- protocol adapters are your most critical code path |
| Building a custom auth system instead of using Auth0/Clerk | Full control, no vendor dependency | Security vulnerabilities, maintenance burden, no compliance certifications | Never for a small team. Use a managed auth provider. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MCP Server connections | Treating tool descriptions as static; no monitoring for description changes | Implement tool description diffing and alerting (mcpdiff pattern). Description changes can alter agent behavior without schema breaks. |
| LLM Provider APIs (OpenAI, Anthropic, Google) | Assuming consistent pricing and rate limits across providers | Build a provider abstraction with per-provider rate limit tracking, cost normalization, and automatic failover. Pricing changes monthly. |
| OAuth 2.1 for agent auth | Using long-lived tokens because short-lived tokens add complexity | Always use short-lived tokens with PKCE. The blast radius of a compromised long-lived token in an agent system is catastrophic. |
| Agent framework SDKs (LangChain, CrewAI, AutoGen) | Deep coupling to one framework's internal APIs | Support OpenTelemetry as the universal telemetry standard. Framework-specific adapters should be thin wrappers. |
| Cloud provider billing APIs | Polling for cost data (hourly/daily) | Use real-time cost estimation from token counts + provider pricing tables. By the time billing APIs report, the $47K bill has already happened. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Storing every agent event/trace without sampling | Storage costs exceed revenue; query latency degrades | Implement adaptive sampling from day one. Store 100% for errors, sample 1-10% for normal traffic. | >1,000 active agents (~100M events/day) |
| Synchronous credential validation on every agent tool call | Agent response latency increases 50-200ms per tool call | Cache validated credentials with short TTL (5-60 seconds). Validate async. | >100 concurrent agent sessions |
| Single-threaded event processing pipeline | Events queue up during agent burst activity; dashboard shows stale data | Design for horizontal scaling from the start. Use message queues (SQS/Kafka) not in-process queues. | >10,000 events/second (one recursive agent can hit this) |
| Real-time cost dashboards with per-event database writes | Database write amplification; cost tracking becomes the largest cost | Batch and aggregate cost events. Update dashboards every 5-30 seconds, not per-event. | >50 active customers with production agent workloads |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing customer API keys alongside your application database | Single SQL injection exposes all customer credentials to all downstream services | Use dedicated secret management (AWS Secrets Manager, HashiCorp Vault). Customer keys should never be in the same data store as application data. |
| No audit trail for credential access | Cannot detect or investigate unauthorized access; fails SOC 2 audit | Log every credential read/write with timestamp, accessor identity, and purpose. Immutable audit log from day one. |
| Trusting MCP tool descriptions without validation | Tool poisoning attack: malicious tool description causes agent to exfiltrate data through your infrastructure | Validate and sanitize tool descriptions. Implement allow-lists for known-good tools. Alert on description changes. |
| No rate limiting on agent-initiated API calls through your infrastructure | A single compromised or malfunctioning agent can exhaust your API quotas and your customer's budget | Per-agent, per-customer, and global rate limits. Circuit breakers that trigger on anomalous patterns. |
| Handling EU user data without GDPR compliance | Fines up to 4% of global revenue; enterprise customers will not adopt | Data residency controls from architecture phase. Know where every piece of customer data lives. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Requiring complex configuration before first value | Developer abandons during setup; never reaches "aha moment" | 5-minute or less time-to-first-value. Single API key or `npx` command to start. |
| Dashboard-first product design (pretty charts, no actionable insights) | Developer looks at dashboard, says "interesting," and never returns | Alert-first design. Tell the developer when something is wrong, not just show them data. Push notifications > pull dashboards. |
| English documentation that reads like translated Japanese (grammatically correct but culturally awkward) | Developer does not trust the product because the docs feel "off" | Have native English speakers review all documentation. Use tools like Hemingway Editor. Study Stripe/Vercel docs as style guides. |
| Requiring framework-specific SDK installation | Limits adoption to users of that framework; others move on | Provide a framework-agnostic HTTP API first. Framework SDKs are convenience layers, not requirements. |
| No self-hosted option | Privacy-conscious developers and companies in regulated industries will not adopt cloud-only infrastructure that handles their credentials | Offer both cloud and self-hosted from the start (Langfuse model). For credential-handling infrastructure, self-hosted is not optional. |

## "Looks Done But Isn't" Checklist

- [ ] **Protocol support:** MCP integration works for basic tool calls -- but does it handle streaming responses, multi-turn conversations, and tool description changes? Verify with mcpdiff-style testing.
- [ ] **Cost tracking:** Dashboard shows cost per API call -- but does it handle multi-provider cost normalization, currency conversion, and cost attribution across nested agent hierarchies? Verify with multi-model agent test scenario.
- [ ] **Auth management:** OAuth flow works in demo -- but does it handle token refresh under concurrent agent load, credential rotation without downtime, and revocation propagation? Verify with 100-concurrent-agent load test.
- [ ] **Error handling:** Retry logic works for 500 errors -- but does it handle rate limit responses (429) with provider-specific backoff, partial failures in multi-tool calls, and cascading failures across agent chains? Verify with chaos engineering tests.
- [ ] **Documentation:** README covers installation -- but does it include troubleshooting for common failure modes, migration guides for version upgrades, and architecture decision records? Verify by having a developer who has never seen the product follow the docs end-to-end.
- [ ] **Observability:** Traces are captured -- but are they queryable at scale? Can a user find "all failed tool calls in the last hour for agent X"? Verify with 1M+ trace query performance test.
- [ ] **Global readiness:** English content is grammatically correct -- but does it pass the "would a US developer tweet this?" test? Verify with native English speaker review.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Protocol breaking changes (MCP/A2A major version) | MEDIUM (2-4 weeks if abstracted, 2-4 months if not) | If abstracted: update adapter layer, run integration tests, deploy. If not: extract protocol concerns into adapter, migrate incrementally, maintain backward compatibility during transition. |
| Platform absorption (Big Tech ships your feature) | HIGH (potentially fatal) | Pivot to a narrower vertical or deeper capability the platform does not cover. Double down on developer experience and community. Consider pivoting to complementary rather than competing. |
| Security breach / credential leak | CRITICAL (potentially fatal) | Incident response plan must exist BEFORE this happens. Rotate all affected credentials immediately. Notify all affected customers within 24 hours. Publish transparent post-mortem. Engage external security audit. |
| Monetization failure (no one pays) | MEDIUM (3-6 months to pivot pricing) | Survey churned users for willingness-to-pay. Identify the one feature with highest perceived value. Consider switching from SaaS to usage-based or from usage-based to outcome-based. |
| Timing miss (market too early) | MEDIUM-HIGH (6-12 months of runway burn) | Reduce burn rate to minimum. Open-source the core product. Pivot to consulting/services revenue while waiting for market maturation. Maintain community presence. |
| Focus loss (too many features, none excellent) | MEDIUM (3-6 months to refocus) | Measure per-feature retention. Kill features below 20% weekly active usage. Redirect all engineering to the top-performing feature. Communicate the focus change transparently. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Protocol platform risk (MCP/A2A) | Phase 0 (research) + Phase 1 (architecture) | Architecture review confirms protocol abstraction layer exists with swappable adapters. Integration test suite covers multiple protocol versions. |
| Big Tech absorption risk | Phase 0 (research -- domain selection) | Competitive analysis updated quarterly. Product differentiation is articulable in one sentence that does not describe a commodity feature. |
| Timing trap (too early/late) | Phase 1 (validation) | Free tool has >100 weekly active users within 60 days of launch without paid marketing. Users submit feature requests (demand signal). |
| Japan-to-global market gap | Phase 1 (documentation) + Phase 2 (GTM) | Native English speaker has reviewed all public content. GitHub engagement ratio (issues+discussions / stars) is >5%. US/EU users represent >50% of active users. |
| Monetization model mismatch | Phase 2 (observation) + Phase 3 (pricing) | Unit economics are positive at 100 customers. Pricing aligns with cost structure. Churn rate <10% monthly after paid launch. |
| Recursive cost problem | Phase 1 (architecture) | Load test with 100x normal traffic does not increase infrastructure cost by more than 10x (sublinear scaling verified). Hard rate limits and circuit breakers are in place. |
| Security as afterthought | Phase 1 (architecture) | Threat model document exists. All credential storage uses KMS. Audit logging is active. SOC 2 Type I preparation has started by Phase 2. |
| Breadth over depth | Phase 0 (research -- this project) | Product solves ONE problem end-to-end. Roadmap has at most 2 major feature domains for the first year. Users describe the product by its primary function, not as a "platform." |

## Sources

- [Composio: The 2025 AI Agent Report -- Why AI Pilots Fail](https://composio.dev/blog/why-ai-agent-pilots-fail-2026-integration-roadmap) -- integration failure modes, agent infrastructure gaps
- [Gartner: Over 40% of Agentic AI Projects Will Be Canceled by End of 2027](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027) -- market timing risk, agent washing, enterprise adoption gaps
- [Tech Startups: $47,000 AI Agent Failure](https://techstartups.com/2025/11/14/ai-agents-horror-stories-how-a-47000-failure-exposed-the-hype-and-hidden-risks-of-multi-agent-systems/) -- recursive cost problem, governance gaps
- [Lukas Kania: MCP Tool Description Changes](https://medium.com/@binarEx/your-mcp-servers-tool-descriptions-changed-last-night-nobody-noticed-e3ad93cf6bc7) -- protocol instability, tool poisoning
- [CoSAI: MCP Security Whitepaper](https://adversa.ai/blog/mcp-security-whitepaper-2026-cosai-top-insights/) -- MCP security risks
- [AI Agent Protocol Wars Explained](https://www.hungyichen.com/en/insights/ai-agent-protocol-wars) -- MCP vs A2A standardization timeline, AAIF governance
- [Ardent VC: The Moat Just Moved](https://medium.com/@ardent-vc/the-moat-just-moved-areas-of-opportunity-in-ai-native-software-6bf9619552f3) -- moat erosion in developer tools
- [Sri Srujan Mandava: Agentic AI Infrastructure Landscape 2025-2026](https://medium.com/@vinniesmandava/the-agentic-ai-infrastructure-landscape-in-2025-2026-a-strategic-analysis-for-tool-builders-b0da8368aee2) -- defensible positions for tool builders
- [Bessemer Venture Partners: AI Pricing and Monetization Playbook](https://www.bvp.com/atlas/the-ai-pricing-and-monetization-playbook) -- monetization strategies, renewal cliff
- [Disrupting Japan: Patrick McKenzie on Micro-Startups](https://www.disruptingjapan.com/create-micro-startup-japan-patrick-mckenzie/) -- Japan-to-global market strategy
- [Global Venturing: Where Are Japan's Global Startups?](https://globalventuring.com/corporate/asia/japan-global-startups/) -- Japanese startup global expansion barriers
- [Cloudflare: Building AI Agents with MCP, AuthN/AuthZ](https://blog.cloudflare.com/building-ai-agents-with-mcp-authn-authz-and-durable-objects/) -- Big Tech platform absorption of agent infra
- [IANS Research: AI Agents Creating Identity Security Crisis](https://www.iansresearch.com/resources/all-blogs/post/security-blog/2026/02/24/ai-agents-are-creating-an-identity-security-crisis-in-2026) -- agent identity governance gaps
- [The New Stack: AI Infrastructure Will Face a Reckoning in 2026](https://thenewstack.io/in-2026-ai-infrastructure-will-face-a-reckoning/) -- infrastructure cost and scaling challenges
- [WebProNews: Small AI Teams vs Big Tech](https://www.webpronews.com/shiva-fund-bets-10m-that-tiny-ai-teams-will-outperform-big-tech-by-2026/) -- small team advantage/disadvantage dynamics

---
*Pitfalls research for: AI Agent Infrastructure Services*
*Researched: 2026-03-13*
