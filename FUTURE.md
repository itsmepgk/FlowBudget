# Future Features

## Planned

### Multi-currency within a group
Allow individual expenses inside a group to each have their own currency (e.g. one expense in EUR, another in USD), independent of the group's base currency.
- Requires a `currency` column on `expenses`
- Requires exchange rate integration (e.g. exchangerate.host or OpenExchangeRates) to convert all amounts to the group's base currency before computing balances
- UI: currency selector on the Add/Edit Expense modal
- Balance display: show amounts in base currency with original noted

## Backlog

- **Recurring expenses** — weekly/monthly auto-added expenses (e.g. rent, subscriptions)
- **Expense comments** — add notes/context to individual expenses
- **Receipt photos** — attach an image to an expense (Supabase Storage)
- **Export** — download group expenses as CSV or PDF
- **Group profile photo** — avatar/cover image per group
- **Mobile app** — React Native or PWA wrapper
- **Notifications** — email digest when someone adds or settles in a group
