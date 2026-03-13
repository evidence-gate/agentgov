# Summary: 05-01 Market Sizing (TAM/SAM/SOM)

## What was done
Researched and wrote comprehensive market size estimates (TAM/SAM/SOM) for all 14 AI agent infrastructure categories, with bottom-up methodology grounded in developer population data, enterprise spend benchmarks, and analyst projections.

## Key outputs
- `report/05-developer-pain-points-and-market-sizing-part1.md` -- 14 categories sized with TAM/SAM/SOM estimates

## Key findings

### Market Context
- AI agent market: $9-10B in 2026, growing at CAGR 40-42%
- Global AI spending: $2.53T in 2026 (Gartner)
- Agent infrastructure layer estimated at $1.5-2.5B (15-25% of agent market)

### Top 3 Categories by SAM
1. **Deployment/Hosting**: $1-3B (but commoditized, LOW opportunity)
2. **Cost Control**: $500M-1.2B (CAGR 50-70%, HIGH opportunity -- no dedicated product)
3. **Observability**: $400-800M (but saturated with Braintrust $80M, Arize $70M)

### Sweet Spot (Large Market x Large Gap)
- **Cost Control** (Cat 5): SAM $500M-1.2B, no dedicated product, 78% of IT leaders report unexpected AI costs
- **HITL/Approval** (Cat 11): SAM $300-700M, EU AI Act creates mandatory demand, sole specialist pivoting away

### Key Insight
Cost Control + HITL bundling = combined SAM $800M-1.9B with natural product integration ("$50+ action -> human approval")

## Decisions made
- Bottom-up methodology using developer population (17.4M AI/ML devs, ~200-300M building agents) x segment-specific infrastructure spend
- Enterprise agent ops cost benchmark: $3,200-$13,000/month/deployment
- Infrastructure spend estimated at 15-25% of total agent deployment cost

## Duration
~15 minutes
