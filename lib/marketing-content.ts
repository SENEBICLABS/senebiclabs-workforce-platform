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
    a: "You are paid per reviewed case. The rate for a body of work is shown before you accept it, so you always know what a case pays before you begin. Cases you flag as unclear are paid the same as cases you complete.",
  },
  {
    category: "Pay",
    q: "Am I paid for work that is sent back?",
    a: "Yes. Reviewing is paid for the pass you make, not for the outcome you reach. Sending written work back to be rewritten pays the same as approving it, so there is nothing to gain by waving something through.",
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
 * What a clinician actually does, as three things they can look through on the
 * landing page rather than read all at once.
 *
 * Every line describes a control the workspace really renders: the choice and
 * scale fields, the span highlighter, the free text and structured fields, the
 * flag, and approve / edit / send back on a review pool. Nothing here is
 * aspirational, so it stays true as long as those do.
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
  mock: "judge" | "write" | "approve";
}

export const WORK_TASKS: WorkTask[] = [
  {
    tab: "Judge an answer",
    title: "Judge an answer",
    why: "A model's answer is only as good as the clinician who checks it. What you decide is what the model is measured and corrected against.",
    how: "Read the case and the answer the model gave, with the rubric for that work beside you. Say whether it holds up, choose what went wrong if it did not, highlight the exact passage at fault, and rate how confident you are.",
    mock: "judge",
  },
  {
    tab: "Write the answer",
    title: "Write the answer yourself",
    why: "Where the model's answer will not do, the correct one has to come from a clinician who practises in that area.",
    how: "Write it against the guidelines you already work to: structured fields where the work needs structure, prose where it needs prose. It goes to a second clinician for approval, never straight out.",
    mock: "write",
  },
  {
    tab: "Approve a colleague's",
    title: "Approve a colleague's",
    why: "No written answer leaves on one clinician's say-so. A second reading by someone else in the specialty is what makes it safe to use.",
    how: "Approve it as it stands, edit it where it is nearly right, or send it back saying what has to change. The platform never offers you your own work, and sending back pays exactly what approving pays.",
    mock: "approve",
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
    title: "Review and get paid",
    body: "Work through cases remotely, on your own schedule, paid per reviewed case, including the ones you flag.",
  },
];

export const ELIGIBILITY = [
  "An active clinical licence in good standing",
  "A clinical specialty you practise in",
  "Comfort reading and assessing written cases",
  "A reliable internet connection",
];
