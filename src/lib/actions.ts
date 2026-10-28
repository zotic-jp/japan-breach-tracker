import type { Incident } from "../../schema/incident.ts";
import { brandName } from "../../schema/names.ts";

export interface Action {
  // Short form for the league table card.
  short: string;
  // Full sentence for the incident page.
  detail: string;
}

// What someone affected should do, most urgent first, based on the data that leaked.
export function actionsFor(i: Incident): Action[] {
  const name = brandName(i.organization.name_en);
  const has = (...types: Incident["data_types"]) => types.some((t) => i.data_types.includes(t));
  const actions: Action[] = [];
  if (has("password"))
    actions.push({
      short: "Change your password",
      detail: `Change your ${name} password, and the password on any other site where you used the same one.`,
    });
  if (has("credit_card"))
    actions.push({
      short: "Check your card statements",
      detail: "Check your card statements for charges you don't recognise, and ask your card company for a new card number.",
    });
  if (has("bank_account"))
    actions.push({ short: "Watch your bank account", detail: "Watch your bank account for unexpected transfers." });
  if (has("id_document", "my_number"))
    actions.push({
      short: "Beware scams using your ID",
      detail: "Be wary of anyone contacting you who already knows your ID details. Scammers use leaked IDs to seem genuine.",
    });
  actions.push({
    short: "Watch for fake emails and texts",
    detail: `Expect phishing. Emails or SMS messages claiming to be from ${name} about this incident may be fake. Go to their website directly rather than clicking links.`,
  });
  actions.push({
    short: "Turn on two-factor login",
    detail: "Turn on two-factor authentication for this account if it offers it.",
  });
  return actions;
}
