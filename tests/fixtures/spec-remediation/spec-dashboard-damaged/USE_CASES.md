# Use Cases

## UC-1: Inspect a dashboard card

**Actor:** Developer

**Preconditions:** A specification exists.

**Main flow:**
1. The developer opens a dashboard or report.
2. The client requests a card detail route.
3. The route returns JSON.

**Postconditions:** A response was returned.

**Open Questions:**
- [ ] Is this a web application, CLI report, or TUI?
- [ ] How is a specification selected?
- [ ] What happens for loading, empty, unavailable, and provider-error states?
- [ ] How does the developer return from detail without losing board context?
- [ ] Are search, filtering, sorting, pagination, retry and deep links required?
