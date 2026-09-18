/**
 * Copy shared across the public pages.
 *
 * The FAQ lives here rather than in a page so the landing and /faqs cannot
 * drift apart: the landing shows the featured subset, /faqs shows all of it,
 * and both read the same source.
 *
 * Nothing here states a figure. No clinician counts, no rates, no client names.
 * Any number on a page recruiting doctors has to be one we can stand behind,
 * and we do not have those yet.
 */

export interface Faq {
  q: string;
  a: string;
  category: "Joining" | "The work" | "Pay" | "Practicalities";
  /** Shown on the landing page as well as on /faqs. */
  featured?: boolean;
}

export const FAQS: Faq[] = [
  {
    category: "Joining",
    featured: true,
    q: "Can I sign up directly?",
    a: "Not yet. Membership is by invitation for now. You can request access by telling us who you are, and we will email you when Senebiclabs opens to clinicians. Nothing is created until then.",
  },
  {
    category: "Joining",
    q: "How do I get an invitation?",
    a: "For now, invitations go to a small group of clinicians we work with directly. Request access from the top of any page and you will be on the list: we will email you when we open to clinicians.",
  },
  {
    category: "Joining",
    featured: true,
    q: "When will Senebiclabs open to clinicians?",
    a: "We have not set a date yet. Everyone who requests access is on the list, and we will email the list when we open.",
  },
  {
    category: "Joining",
    q: "What do you do with the details I send?",
    a: "We keep your request so that we can email you when we open, and we only use your address for that. The confirmation email has a link that removes your address and deletes your request, whenever you want.",
  },
  {
    category: "Joining",
    q: "What happens when I open my invitation?",
    a: "It takes you to a sign-in page where you continue with Google or with the address the invitation was sent to. Either one creates your account and takes you straight in. Nothing else is needed.",
  },
  {
    category: "Joining",
    q: "Can I invite a colleague?",
    a: "Some members can. Once you are established on the platform we may enable invitations on your account, which lets you invite colleagues directly. Every invitation is for one named address and is good once.",
  },
  {
    category: "The work",
    featured: true,
    q: "Do I need experience with AI?",
    a: "No. The judgment we need is clinical, not technical. If you can assess whether an answer is right for a patient, you can do this work.",
  },
  {
    category: "The work",
    q: "What does a review actually involve?",
    a: "You read a case and the answer a model gave, judge it against the guidelines you already work to, confirm or correct it, and flag anything clinically unsafe. The rubric for that body of work sits beside the case while you read it.",
  },
  {
    category: "The work",
    q: "What if a case is outside my area?",
    a: "Flag it. A flagged case goes to another clinician rather than forcing you to guess, and flagging is paid the same as completing. Guessing costs everyone more than flagging does.",
  },
  {
    category: "The work",
    q: "Does anyone check my work?",
    a: "Several clinicians see each case. Where you disagree with each other the case is adjudicated rather than settled by majority. For written work, one clinician writes and a different one approves, and nobody approves their own writing.",
  },
  {
    category: "The work",
    featured: true,
    q: "Which specialties do you work with?",
    a: "A range, and it changes as new work arrives. Invitations follow the work, so a specialty that is quiet now may open later.",
  },
  {
    category: "Pay",
    featured: true,
    q: "How does pay work?",
    a: "You are paid at professional rates. The rate for a body of work is shown before you accept it, so you always know what it pays before you begin. Cases you flag as unclear are paid the same as cases you complete.",
  },
  {
    category: "Pay",
    q: "Am I paid for work that is sent back?",
    a: "Yes. You are paid for the pass you make, not for the outcome you reach. Sending written work back to be rewritten pays the same as approving it, so there is nothing to gain by waving something through.",
  },
  {
    category: "Practicalities",
    featured: true,
    q: "How much time does it take?",
    a: "As much or as little as you want. There are no minimum hours and no shifts. Your place is saved between sessions, so you can stop mid-case and come back.",
  },
  {
    category: "Practicalities",
    featured: true,
    q: "Where do I need to be?",
    a: "Anywhere with a reliable connection. The work is fully remote and you choose your own hours.",
  },
  {
    category: "Practicalities",
    q: "What happens to the cases I read?",
    a: "Case material stays inside the platform. You see only the pools you have been given access to, nothing is downloadable, and you are asked not to discuss or retain what you read.",
  },
];

export const FAQ_CATEGORIES: Faq["category"][] = [
  "Joining",
  "The work",
  "Pay",
  "Practicalities",
];

/**
 * What a clinician actually does, as the three purposes a pool can have:
 * evaluate, label, create. They are the words PurposeBadge already shows on
 * every pool card, so the page and the workspace call the work one thing.
 *
 * Peer review is named inside Create rather than given a tab of its own. It is
 * a phase of written work, not a kind of work: Task.phase only reaches
 * "review" for a config with free-text fields, so a choice-only pool never has
 * one, and a tab for it would read as a category no clinician would recognise.
 *
 * Every line describes a control the workspace really renders: the choice and
 * scale fields, the span highlighter, the free text and structured fields, and
 * the flag. Nothing here is aspirational, so it stays true as long as those do.
 */
export interface WorkTask {
  /** Short label for the tab itself. */
  tab: string;
  title: string;
  /** Why the task exists, in the clinician's terms. */
  why: string;
  /** What you actually do. */
  how: string;
  /** Which preview of the workspace sits beside it. */
  mock: "judge" | "label" | "write";
}

export const WORK_TASKS: WorkTask[] = [
  {
    tab: "Evaluate",
    title: "Assess the AI's answer",
    why: "A model's answer is only as good as the clinician who checks it. What you decide is what the model is measured and corrected against.",
    how: "Read the case and the answer the model gave, with the rubric beside you. Say whether it holds up, set the correct answer where it does not, flag anything that could harm a patient, and rate it on the axes that pool uses. A short written reason goes with each judgement.",
    mock: "judge",
  },
  {
    tab: "Label",
    title: "Label clinical data",
    why: "Before a model can learn from medical data, someone qualified has to say what it actually shows.",
    how: "Read the case and record what it shows: the category it belongs to, the findings present, and whether a claim holds up against the evidence. Where a statement is wrong, highlight the exact words and write the correction.",
    mock: "label",
  },
  {
    tab: "Create",
    title: "Write the correct answer",
    why: "Where the model's answer will not do, the correct one has to come from a clinician who practises in that area.",
    how: "Write it against the guidelines you already work to: structured fields where the work needs structure, prose where it needs prose. Nothing you write leaves on your say-so alone. A second clinician reads it and approves, edits, or sends it back, and you will be asked to do that reading for others.",
    mock: "write",
  },
];

/**
 * Why a clinician would join, as four claims a reader can check.
 *
 * Every sentence here is backed by something that already exists: the terms in
 * app/agreement/page.tsx, which each member accepts, and behaviour the
 * platform implements. Rates published per pool and weekly payment are
 * agreement terms. Choosing your own pools and hours is agreement term 1.
 * Working to the rubric supplied with a pool, and flagging where it conflicts
 * with your own standard of care, is term 2. Seeing only the pools you are
 * eligible for is enforced server-side on every request.
 */
export interface WhyJoin {
  title: string;
  /** The claim, said plainly. */
  lead: string;
  /** What it means in practice, so the claim is checkable rather than a slogan. */
  detail: string;
}

export const WHY_SENEBICLABS: WhyJoin[] = [
  {
    title: "Paid at professional rates",
    lead: "A rate is published for every pool before you take it on, so you never start work not knowing what it pays.",
    detail: "Payments clear weekly. A case you flag as one you cannot judge is paid at the same rate as one you complete, so there is never a reason to guess rather than say so. These are terms in the agreement you accept when you join, not aspirations.",
  },
  {
    title: "You choose the work and the hours",
    lead: "You pick which pools you take and when you work on them. There are no shifts, no minimum hours and no targets.",
    detail: "You are engaged as an independent clinician rather than an employee. Your answers are saved as you go, so you can stop halfway through a case, close the tab, and pick it up where you left off.",
  },
  {
    title: "Inside your own specialty",
    lead: "You review in the area you actually practise, and you see only the pools you have been made eligible for.",
    detail: "That is enforced by the platform on every request, not left to a policy. Each pool carries the rubric written for it by the clinical leads, which sits beside the case while you read. Where the rubric and your own standard of care disagree, you flag the case rather than resolve it yourself.",
  },
  {
    title: "Your judgment is the reference",
    lead: "What you decide becomes the standard a medical AI system is measured and corrected against.",
    detail: "Several clinicians see each case, and where you disagree with each other it goes to adjudication rather than being settled by majority. Your reading is recorded as a clinician's judgment, with a specialty and a licence behind it, not as one vote among many.",
  },
];

/**
 * How someone gets from reading a page to reviewing a case, as it is today:
 * request access, wait for us to open, get verified, work. Shared so the
 * landing page and About us tell the same four steps.
 */
export const JOIN_STEPS = [
  {
    title: "Request access",
    body: "Tell us your name, your specialty and the country you practise in. It takes a minute.",
  },
  {
    title: "Hear from us",
    body: "You are on the list. When Senebiclabs opens to clinicians, we email you.",
  },
  {
    title: "Get verified",
    body: "We check your licence against the register it was issued by, and a short set of cases in your specialty matches you to the right work.",
  },
  {
    title: "Work and get paid",
    body: "Work through cases remotely, on your own schedule, at professional rates, including the cases you flag.",
  },
];

export const ELIGIBILITY = [
  "An active clinical licence in good standing",
  "A clinical specialty you practise in",
  "Comfort reading and assessing written cases",
  "A reliable internet connection",
];
