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
    a: "No. Membership is by invitation only. You can request access by telling us who you are: we review every request by hand, and reach out with an invitation when there is work that fits. The invitation is what creates your account.",
  },
  {
    category: "Joining",
    q: "How do I get an invitation?",
    a: "Request access from the top of any page, or be introduced by a clinician already reviewing with us. We assess each request, and invitations go out when there is work open in a specialty, so they follow the work rather than a queue.",
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

export const ELIGIBILITY = [
  "An active clinical licence in good standing",
  "A clinical specialty you practise in",
  "Comfort reading and assessing written cases",
  "A reliable internet connection",
];
