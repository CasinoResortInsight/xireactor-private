# User Stories

Day-in-the-life narratives showing how non-technical leaders at a casino resort property use the Brilliant knowledge base in their normal work. The goal here isn't to list features — it's to show what changes when an organization's institutional memory is searchable, linkable, and shared with an AI assistant that respects governance.

Three personas:

1. [President / General Manager](#1-president--general-manager)
2. [Director of Marketing](#2-director-of-marketing)
3. [Restaurant Manager](#3-restaurant-manager)

---

## 1. President / General Manager

**Maria Alvarez**, President & GM of a 1,200-room destination resort with a 70,000 sq ft casino floor, four F&B outlets, an events venue, and a spa. She reports to ownership, runs an executive team of nine, and spends her week shuttling between strategy, regulatory, and operational fires.

### Before Brilliant

Maria's institutional memory lives in her own head and in roughly 400 emails per week. Decisions get made in meetings and then quietly forgotten — six months later someone asks "wait, why did we kill the Tuesday senior promo?" and nobody can find the reasoning. Her morning is spent reconstructing context: skimming Slack, opening yesterday's notes app, pinging her EA for the agenda.

### A Tuesday in her week

**7:40 a.m. — Coffee, then a briefing.** Maria opens her assistant and asks for a resume briefing. In about ten seconds she gets: what changed in the knowledge base since she last checked, the prior day's roll-up across departments, and a short list of items her directors flagged overnight. She didn't have to chase anyone — the stuff that matters actually surfaces.

**8:00 a.m. — Yesterday at the property, in one screen.** Before her standup, Maria asks for the daily summary. She gets a single page: marketing closed the headliner deal, F&B logged two notable comps and a salamander outage at the steakhouse, the casino floor flagged two high-limit hold variances, HR finalized two hires, and three directors logged decisions she should be aware of. She used to get this picture from nine separate emails over the course of the morning. Now she has it before her coffee is cold.

**8:15 a.m. — Exec standup.** During the meeting her CFO mentions the 2024 cage incident as precedent for a current cash-handling question. Maria asks her assistant to pull every entry tagged `cage-ops` and `incident`. Three results come back, including the actual post-mortem with the corrective actions and who signed off. She reads the relevant paragraph aloud. The meeting moves on in two minutes instead of twenty.

**10:30 a.m. — Strategy session on summer programming.** Maria's team is debating whether to repeat last year's July fight-night promotion. She pulls the linked record: the original decision, the marketing brief, the slot performance numbers from that weekend, the F&B covers, and the after-action review. Everything is cross-linked, so one entry leads her to the next without anyone digging through SharePoint. The "should we do this again" conversation becomes a "here's what we'd change" conversation.

**1:00 p.m. — Decision logged.** They commit to a revised fight-night format. Maria dictates a two-paragraph decision entry — the call, the reasoning, the dissent (her VP of Marketing wanted a different headliner), and the success criteria. It gets filed under `Decisions/2026/summer-programming` and linked to the prior year's record. Six months from now, when someone asks "why did we go this direction?", the answer will still be there with the reasoning intact.

**3:00 p.m. — Quiet half-hour.** Maria looks at usage stats for the knowledge base. She notices the operations team has been reading the "guest complaint escalation" guide three times a day for the past two weeks. That's a signal. She schedules a 15-minute follow-up with her COO: is something happening on the floor that we need to look at? The KB surfaced a soft trend before it became a hard problem.

**5:45 p.m. — End of day.** Maria appends a few lines to her daily note: what she decided, what she's worried about, what she wants to pick up tomorrow. Tomorrow's resume briefing will start from there.

### Agents working alongside Maria

Maria doesn't run agents directly, and she doesn't sit in any approval queue. Agents run in the background, read the same knowledge base she does, and surface their work to her through the briefings and summaries she already reads. When they draft *for her*, they write into her personal zone — private to Maria, no admin review needed. When something Maria authors needs to enter the shared record, it goes through the KB admin's queue like every other shared write.

- **Briefing agent.** Each morning, reads yesterday's daily notes from every department, the previous evening's shift summaries, anything tagged `escalation` or `urgent`, and items her directors flagged. Writes a one-screen morning brief into Maria's personal zone. Maria reads it; nothing leaks to the shared record without her promoting it.
- **Decision-archivist agent.** Listens for moments in Maria's day where she's making a call — a meeting dictation, a paragraph she types into her daily note — and drafts a structured decision entry (call, reasoning, dissent, success criteria, links to relevant prior decisions it reads from the KB). The draft lands in her personal zone tagged `pending-promotion`. Once Maria edits and promotes, it becomes canon.
- **Trend-watcher agent.** Runs on a schedule. Reads usage stats and recent entry activity across departments. When a knowledge area gets hot (the "guest complaint escalation" pattern she noticed), it writes a short observation into her personal zone — not a recommendation, just a flag with the evidence linked. Maria decides whether to act.
- **Quarterly-prep agent.** A week before ownership reviews, it reads every decision entry, every executed promotion's outcome, every incident post-mortem, and every department's monthly rollup for the quarter. Drafts a narrative review in her personal zone. She edits, not authors.

### What changed for her

- Morning context-reconstruction time dropped from ~45 minutes to under 10.
- Decisions now travel with their reasoning. New executives ramp faster because the "why" is recoverable.
- She catches soft trends through usage signals, not just through people escalating to her.
- A single daily summary replaces the morning email cascade — she sees the whole property in one screen instead of nine inboxes.

---

## 2. Director of Marketing

**Devon Park**, Director of Marketing. Owns brand, promotions, the player loyalty calendar, freeplay strategy, paid media, and the agency relationship. Reports to Maria. Manages a team of six and works with two outside agencies.

### Before Brilliant

Devon's team runs 60–80 promotions a year. The creative briefs live in Google Drive, the performance data lives in a BI tool, the agency calls live in Otter transcripts, and the strategic reasoning lives in his head and a few Slack threads. Every quarter when he reports to ownership, he spends two days rebuilding the narrative. When a new coordinator joins, ramp takes a month because there's no single place to learn "how we think about promotions."

### A week in his work

**Monday — Agency check-in.** Devon's agency joins the weekly call. Afterwards, he drops the transcript into the knowledge base inbox. By the time he's back from lunch, the meeting has been digested into an entry: the decisions, the action items, who owns what, and links to the campaigns it relates to. He skims it, fixes one attribution, and approves. The transcript itself is also stored as an attachment in case anyone wants the raw record.

**Tuesday — Freeplay strategy.** Devon is rebuilding the mid-week freeplay program. He searches the knowledge base for everything tagged `freeplay` and `mid-week`. Three years of programs come back, each linked to its results and its post-mortem. He sees a pattern he hadn't noticed: the Wednesday programs always underperformed the Tuesday ones, and every time someone proposed Wednesday it was because a vendor pitched it. That's not a coincidence. He files a short strategy note documenting the pattern and tags it so future-Devon (or a future hire) will find it before re-litigating the same decision.

**Wednesday — Creative brief.** A new headliner concert is coming. Devon drafts the creative brief in his personal zone — a private space where his rough thinking won't pollute the team's shared library. He iterates with his assistant for an hour. Once it's good, he promotes it into the team's marketing library and tags the campaign. The agency now has the same source-of-truth he does.

**Thursday — Competitive intel.** A new property opened across the river. Devon's team has been collecting screenshots of their promos, comp offers, and player club terms. Instead of these living in someone's downloads folder, they go into the knowledge base under `Competitive/across-the-river/`. Every entry is linked, tagged with the date observed, and searchable. When ownership asks "what's the competitor doing on senior days?", Devon answers in 30 seconds, not 30 minutes.

**Each morning — Daily summary across the team.** Before his 9:15 huddle, Devon asks for a daily summary of marketing activity. He gets a one-page rollup of what each of his six people logged the day before: the loyalty coordinator finished the senior-day creative, the promotions analyst flagged underperformance on the weekend slot tournament, the digital lead pushed two paid-search variants live, and the events manager closed catering for the headliner. He walks into the huddle already knowing what to ask about. The huddle drops from 40 minutes to 20 because nobody has to status-update — Devon already saw the status.

**Friday — Quarterly review prep.** Maria's quarterly check-in is in two weeks. Devon asks his assistant for a summary of every promotion this quarter that's tagged `executed` along with its outcome record. He gets a draft narrative — campaigns, intent, results, what they learned — that he edits down. What used to be two days of slide-building is a half-day of editing.

### Agents working alongside Devon

Devon runs a small fleet of agents that produce *team-visible* output. Their writes flow into the central staging queue, where the KB admin reviews and approves entries before they're promoted into the shared marketing library. Devon doesn't sit in the approval seat — he's the consumer of the approved record, not the gatekeeper.

- **Meeting-digest agent.** Watches the inbox for transcripts. Reads them, plus any campaign entries the meeting references, and writes a structured meeting record: decisions, action items with owners, links to related campaigns and prior meetings. The KB admin reviews and approves; Devon sees it surface as a normal entry the next time he searches.
- **Promotion-analyst agent.** Runs after every promotion's execution window closes. Reads the original creative brief, the campaign plan, the player and gaming data tagged to that promotion, and comparable historical promotions. Writes a post-mortem entry — what was planned, what happened, gap analysis, recommendations — into staging. The KB admin reviews for accuracy and tagging hygiene; Devon and his analyst are pinged only if the admin needs a subject-matter clarification.
- **Competitive-intel agent.** Reads new screenshots, news clippings, and notes that the team drops into `Competitive/inbox/`. Classifies, tags by competitor and theme, links to related internal campaigns, and files into staging under `Competitive/<property>/`. The admin approves; the corpus stays clean without consuming Devon's time.
- **Creative-brief drafter.** A personal-zone agent. Devon describes a campaign concept; the drafter reads brand guidelines, the loyalty calendar, and the last three comparable briefs, then drafts in *his* personal zone — which is private to him and not subject to admin review. He iterates with it for an hour. When he's ready, he submits the finished brief to staging; only then does it enter the admin's queue on its way to the shared library.

### What changed for him

- Quarterly reporting time cut by roughly 70% because the source material is already structured.
- New hires onboard in under two weeks; "how we think about promotions" is now a readable library, not tribal knowledge.
- Agencies and internal teams work from the same brief, with the same context and history.
- Competitive intelligence compounds instead of evaporating after the screenshot gets shared once in Slack.

---

## 3. Restaurant Manager

**Sam Whitfield**, GM of the property's steakhouse — 180 seats, 14-cover private dining room, an average check north of $120, and a kitchen team of 22. Reports to the VP of F&B. Works opening and closing shifts most weeks.

### Before Brilliant

Sam's reality is operational. His "knowledge base" today is a stack of printed shift sheets, a binder of vendor contacts that hasn't been updated since 2024, and a phone full of photos of broken equipment. Every new server hire learns the floor from whoever's training that week, which means the experience varies wildly. When Sam goes on vacation, the assistant manager covers — and small fires turn into big ones because the why behind decisions doesn't travel.

### A typical week

**Monday opening shift.** Sam comes in at 2:30 p.m. He asks his assistant for a resume briefing for the steakhouse. He gets: weekend covers vs. forecast, the two comps over $200 and the reasons logged for them, an equipment issue the closing manager flagged Sunday night, and a note that the wine vendor is coming Thursday with a new cab selection. He walks into pre-shift already knowing what mattered over the weekend.

**Tuesday — Shift report becomes the record.** After service, Sam dictates a five-minute shift report into his daily note: covers, top sellers, a sous chef call-out, a guest complaint about steak temperature that he comped and why, and a request from a regular for a private dining date in May. The daily note becomes part of the restaurant's permanent record. He doesn't have to retype anything for the VP's weekly recap — it's already structured.

**Wednesday — Onboarding a new server.** A new hire starts. Sam points her at the steakhouse's onboarding library: floor map, table numbering, the wine list with tasting notes, the steps of service, allergen protocols, the comp policy. It's all in one place, written down, and current. He spends his time coaching her instead of reciting basics. Two weeks in, she's running her own section.

**Thursday — Vendor decision.** The wine rep pitches replacing the house cab. Sam likes it, the sommelier likes it, but the price is up 14%. He drafts the decision in his personal zone first — pros, cons, projected GP impact, the comparable they're displacing — and sleeps on it. Friday morning he commits, promotes the entry into the team-shared zone, and tags it `wine-program` and `vendor-change`. Six months from now when someone asks "why are we pouring this?", the answer is one search away.

**End of every shift — Daily summary as handoff.** When Sam closes, he asks for a daily summary of the steakhouse: covers vs. forecast, comps and reasons, kitchen issues, VIP touches, anything tagged urgent. It becomes the shift handoff document. The opening manager tomorrow doesn't have to call him — they read the summary and walk into service already oriented. When Sam takes a Saturday off, his assistant manager works from the same daily summary Sam would have. Continuity stops depending on a phone call.

**Friday — Weekly recap, automatic.** The VP of F&B wants a Friday recap from every outlet. Sam asks his assistant to roll up the week's daily summaries into one report: covers vs. forecast, top three wins, top two issues, decisions made. Three minutes of cleanup and it's in the VP's inbox. He gets his Friday afternoon back.

**Saturday — Equipment failure.** The salamander dies mid-service. Sam works around it, logs it, and tags it `equipment` and `urgent`. The closing manager sees it on Sunday's briefing. Engineering sees it Monday. Nothing falls through the cracks because Sam wrote it down once and the right people found it.

### Agents working alongside Sam

Sam's agents are operational and high-frequency. They turn voice and shorthand into structured records and answer routine questions so Sam can stay on the floor. Anything destined for the shared steakhouse record goes through the KB admin's queue — Sam doesn't approve agent writes himself.

- **Shift-report agent.** At the end of every shift, Sam dictates five minutes of observations. The agent reads the dictation, the night's reservation and cover data, any tagged incidents, and writes a structured daily note plus a daily summary into staging. The KB admin approves overnight; by the time the opening manager pulls the daily summary the next morning, it's live. Sam doesn't tap-approve anything — he just talks.
- **Onboarding-Q&A agent.** New servers ask it questions during their first two weeks. It reads the onboarding library, the wine list, the allergen protocols, and the comp policy and answers in plain language with links back to the source entry. It does *not* write to the shared record. If a question comes up that the library doesn't answer, it logs the gap to Sam's personal zone so he can decide whether to author an entry himself.
- **Vendor-watch agent.** Reads every decision tagged `vendor` or `contract` and tracks renewal dates, price changes, and performance notes. Two weeks before any renewal, it appends a heads-up to Sam's morning briefing with the original decision linked and any post-decision observations. Read-only against the shared record; writes only into Sam's personal briefing.
- **Weekly-recap agent.** On Friday afternoons, reads the week's daily summaries, top sellers, comps, incidents, and decisions, and drafts the VP recap in Sam's personal zone. Private to Sam until he sends it — no admin review needed because it never enters the shared record; it goes out as an email.

### What changed for him

- Pre-shift briefings give him situational awareness in five minutes instead of a half-hour of asking around.
- New servers learn from a consistent, current library instead of from whoever happened to be on shift.
- His private zone lets him think out loud without committing half-baked ideas to the team record.
- Friday recaps to the VP write themselves from his own shift notes — no double entry.
- When he's off, the assistant manager has the same context he does. Continuity stops depending on him being physically present.

---

## Common threads

Across all three personas, the same handful of capabilities show up:

- **Resume briefings** turn the start of every shift or workday into a five-minute orientation instead of a half-hour scramble.
- **Daily notes** are the cheapest unit of capture — and they compound into a searchable narrative of how the business actually ran.
- **Daily summaries** roll those notes up automatically: for Maria, the whole property in one screen; for Devon, what his team did before the morning huddle; for Sam, the shift handoff and the input to his Friday recap. Same mechanism, different altitude.
- **Tags and links** mean decisions, campaigns, incidents, and outcomes find each other automatically when someone goes looking.
- **Personal zones** let people think privately and then publish deliberately, so the shared record stays high-signal.
- **Usage signals** let leaders like Maria see what knowledge the organization is actually reaching for — and act on the trend before it becomes a problem.
- **Agents as colleagues, not replacements.** Each persona has a small fleet of agents reading the same KB they read and drafting work product into the right place: personal zones for drafts meant for one person (private, no review), or central staging for anything destined for the shared record.
- **Centralized admin review keeps employees out of the approval loop.** A dedicated KB admin reviews and approves agent writes into the shared record. Maria, Devon, and Sam don't sit in queues triaging machine output — they read the approved record like they read anything else, and spend their attention on the work only they can do. Agents read freely; agents write *only where a KB admin reviews* before anything becomes canon. That asymmetry is what makes it safe to let them work continuously without overwhelming the people they support.

The promise isn't a better notes app. It's that the next time someone asks "why did we do that?", "what happened last time?", or "what's our policy on this?" — someone has an answer in seconds, with the reasoning attached, and the answer doesn't depend on which human happens to be in the room.
