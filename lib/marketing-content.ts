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
    a: "No. Membership is vetted and by invitation. You apply, we review your credentials, and if there is work that matches your specialty we email you an invitation. That invitation is what creates your account.",
  },
  {
    category: "Joining",
    q: "What happens after I apply?",
    a: "We check the licence you gave us against the register you are licensed with. If your specialty matches work we currently have, we send an invitation to the address on your application. If it does not, we keep the application rather than turning you away, and come back to you when it does.",
  },
  {
    category: "Joining",
    q: "How long does it take to hear back?",
    a: "It depends on the work we have open at the time. Vetting is done by people rather than automatically, so it is not instant. There is nothing further you need to do once you have applied.",
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
    a: "A range, and it changes as new work arrives. If your specialty is not needed right now we keep your application on file rather than turning you away.",
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
