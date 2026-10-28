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

export type FaqCategory =
  | "Joining"
  | "The work"
  | "Review and quality"
  | "Pay"
  | "Practicalities";

export interface Faq {
  q: string;
  a: string;
  category: FaqCategory;
  /** Shown on the landing page as well as on /faqs. */
  featured?: boolean;
}

/**
 * Every answer here is either something the platform does, a term of the
 * reviewer agreement (app/agreement/page.tsx), or a statement that a policy
 * has not been published. Where a policy is still being set, the answer says
 * so rather than describing one.
 */
export const FAQS: Faq[] = [
  {
    category: "Joining",
    featured: true,
    q: "Who is eligible to apply?",
    a: "Licensed clinicians who currently practise in a clinical specialty and are comfortable reading and assessing written cases. Request access with your name, specialty and the country you practise in. Every request is reviewed by our team, and an invitation is sent only where there is work that fits your practice, so requesting access does not guarantee an invitation.",
  },
  {
    category: "Joining",
    q: "Can I sign up directly?",
    a: "Not yet. Membership is by invitation. Requesting access puts you on our list; it does not create an account. If we invite you, the invitation email is what creates your account.",
  },
  {
    category: "Joining",
    q: "How are credentials checked?",
    a: "We review each request by hand before any invitation is sent, and we will contact you if we need more information about your qualifications or practice. We do not currently ask you to upload documents through the platform.",
  },
  {
    category: "Joining",
    q: "What happens when I receive an invitation?",
    a: "The invitation is for one named address, is good once, and expires after seven days. Opening it lets you continue with Google or with the invited address, and either creates your account. You will then be asked to read and accept the reviewer agreement, which sets out the terms of the work.",
  },
  {
    category: "Joining",
    q: "What do you do with the details I send?",
    a: "We keep your request so that our team can review it, and we use your address only to contact you about it. The confirmation email has a link that removes your address and deletes your request whenever you want.",
  },
  {
    category: "Joining",
    q: "Can I invite a colleague?",
    a: "Some members can. Once you are established on the platform we may enable invitations on your account. Every invitation is for one named address and is good once.",
  },
  {
    category: "The work",
    featured: true,
    q: "What types of assignments are available?",
    a: "Work comes in projects, and each project has one purpose: evaluating answers a medical AI system gave, labelling clinical data, or writing reference answers. Some written work also has a review stage, where a second clinician approves, edits or sends back a colleague's answer. Which of these you see depends on the projects you are given access to; not every clinician does every kind.",
  },
  {
    category: "The work",
    featured: true,
    q: "Does joining guarantee assignments?",
    a: "No. Work depends on the projects we have running and on whether they match your specialty, so there may be periods with nothing available to you. Your dashboard shows what is open to you at any time.",
  },
  {
    category: "The work",
    q: "Do I need experience with AI?",
    a: "No. The judgment we need is clinical, not technical. Each project's rubric explains what to assess, and it sits beside every case while you work.",
  },
  {
    category: "The work",
    q: "What if a case is outside my area?",
    a: "Flag it rather than guess. A flagged case stops being offered to you, and the flag is recorded as work on your work record. We would rather have an honest flag than an answer you are not sure of.",
  },
  {
    category: "Review and quality",
    featured: true,
    q: "How are submissions reviewed?",
    a: "More than one clinician reads each item, and their readings are compared. On projects that use adjudication, items where clinicians disagree go to a senior clinician to resolve rather than being settled by majority. Written answers are read by a second clinician, who approves, edits or sends them back; nobody is ever given their own answer to review.",
  },
  {
    category: "Review and quality",
    q: "What happens if my written answer is sent back?",
    a: "The reviewer gives a reason, and the answer comes back to be rewritten. Sending work back is recorded as a pass for the reviewer exactly as approving it is. There is no formal dispute process published yet; if you disagree with a decision, write to support@senebiclabs.com.",
  },
  {
    category: "Review and quality",
    featured: true,
    q: "How is clinical information handled?",
    a: "Case material is confidential and stays inside the platform. It may contain de-identified patient information, and you agree not to copy, retain, discuss or try to re-identify it. You see only the projects you have been given access to, and your identity is never disclosed to the organisations whose systems are being evaluated.",
  },
  {
    category: "Pay",
    featured: true,
    q: "How is compensation determined?",
    a: "Work is paid. Your rate and payment schedule are agreed with you in writing before you begin, and they are not published on the site or in the platform. Every pass you make is recorded, including cases you flag and written work you send back, and each is paid on the terms agreed with you.",
  },
  {
    category: "Pay",
    q: "When and how are contributors paid?",
    a: "On the schedule and by the method agreed with you in writing. The platform does not yet show rates, balances or statements; your work record lists every pass you have made, by kind, pool and date, so you can check it against what you are paid.",
  },
  {
    category: "Practicalities",
    q: "How much time does it take?",
    a: "As much or as little as suits you. There are no shifts, minimum hours or targets, and your answers are saved as you go, so you can stop mid-case and come back.",
  },
  {
    category: "Practicalities",
    q: "Where do I need to be?",
    a: "The work is remote and done in a web browser, so anywhere with a reliable connection. Tell us the country you practise in when you request access.",
  },
];

export const FAQ_CATEGORIES: FaqCategory[] = [
  "Joining",
  "The work",
  "Review and quality",
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
    how: "Read the case and the answer the model gave, with the project's rubric beside you. Say whether it holds up, identify errors, omissions and anything that could harm a patient, and rate it on the measures the project uses. Some projects also ask for a short written correction.",
    mock: "judge",
  },
  {
    tab: "Label",
    title: "Label clinical data",
    why: "Before a model can learn from medical data, someone qualified has to say what it actually shows.",
    how: "Read the case and record what it shows, using the categories the project defines: the class it belongs to, the findings present, or the exact words in a passage that a label applies to.",
    mock: "label",
  },
  {
    tab: "Create",
    title: "Write the correct answer",
    why: "Where the model's answer will not do, the correct one has to come from a clinician who practises in that area.",
    how: "Write it against the guidelines you already work to, in the fields the project asks for. On projects with a review stage, a second clinician reads your answer and approves, edits or sends it back, and you may be asked to review colleagues' answers in the same way.",
    mock: "write",
  },
];

/**
 * Why a clinician would join, as four claims a reader can check.
 *
 * Every sentence here has to be backed by something that already exists: the
 * terms in app/agreement/page.tsx, which each member accepts, or behaviour the
 * platform implements and a test covers.
 *
 * Two claims were removed from here for being false, and neither is coming
 * back in the form it was written.
 *
 * The rate claim is still gone. It said a rate is published for every pool
 * before you take it on, and the platform has no rate: no column on pools, no
 * amount on a completion, no statement anywhere. It comes back when pay exists,
 * described as whatever was built.
 *
 * The flag claim is gone for a different reason. "A flagged case pays what a
 * completed one pays" was false when flagging wrote no record of work at all;
 * flagging now writes one, of kind "flag", in the same table as a judgement.
 * But a published parity
 * guarantee is not the same promise as a recorded pass: it prices every flag in
 * advance, and the clinician it pays best is the one who flags everything. What
 * the copy asks for instead is the honest flag, which is what we actually want
 * and what the code actually supports. Payment for a flagged case is at the
 * rate agreed in writing, which is agreement clause 5 and nothing more.
 *
 * The check on that claim is /ops: a clinician's flag rate sits beside their
 * completed count, so an operator can see whether flagging is being used as the
 * escape hatch it is or as the cheaper path.
 *
 * What is left is checkable. Being recorded for the pass rather than the
 * outcome is what app/api/tasks/[taskId]/review records: every review pass,
 * approve and send-back alike. Choosing your own pools
 * and hours is agreement term 1. Working to the rubric supplied with a pool is
 * term 2. Seeing only the pools you were invited to is enforced server-side on
 * every request. Clinician identity stays internal: HEALTH strips it from
 * everything a client receives.
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
    title: "Nothing to gain by waving work through",
    lead: "You are recorded for the pass you make, not for the outcome you reach. Sending written work back to be rewritten counts exactly as approving it does. And if you cannot judge a case, flag it rather than guess: we would rather have an honest flag than an answer you are not sure of.",
    detail: "That is not a policy, it is how the code counts. A reviewer who sends a draft back is recorded for that pass, and is not recorded a second time when the rewrite comes back to them. Flagging writes a record of the work too, alongside the note that you could not judge it, so an honest flag is never invisible. You can see every pass you have made, by kind and by pool, on your own work record.",
  },
  {
    title: "You choose the work and the hours",
    lead: "You pick which pools you take and when you work on them. There are no shifts, no minimum hours and no targets.",
    detail: "You are engaged as an independent clinician rather than an employee. Your answers are saved as you go, so you can stop halfway through a case, close the tab, and pick it up where you left off.",
  },
  {
    title: "You are invited to the pools that match your practice",
    lead: "Every pool is invite-only, and you see only the pools you have been invited to.",
    detail: "Seeing only your own pools is enforced by the platform on every request, not left to a policy. Which pools you are given is a judgement we make about your practice. Each pool carries the rubric written for that project, which sits beside the case while you read. Where the rubric and your own standard of care disagree, you flag the case rather than resolve it yourself.",
  },
  {
    title: "Your judgment is the reference",
    lead: "What clinicians decide becomes the standard a medical AI system is measured and corrected against.",
    detail: "More than one clinician reads each item. On projects that use adjudication, items where clinicians disagree go to a senior clinician rather than being settled by majority. Your identity is never disclosed to the organisation whose system is being evaluated.",
  },
];

/**
 * How someone gets from reading a page to reviewing a case, as it is today.
 * Shared so the landing page and About us tell the same steps.
 *
 * There is no in-platform credential check and calibration is switched off,
 * so neither is a step here. Add them back when they exist.
 */
export const JOIN_STEPS = [
  {
    title: "Request access",
    body: "Tell us your name, your specialty and the country you practise in. It takes a minute and does not create an account.",
  },
  {
    title: "We review your request",
    body: "Our team reads every request. Where there is work that fits your practice, we email you an invitation. Not every request leads to one.",
  },
  {
    title: "Accept your invitation and the agreement",
    body: "The invitation creates your account. You then read and accept the reviewer agreement, which sets out the work, confidentiality and how you are paid.",
  },
  {
    title: "Work on the projects you are given",
    body: "Open cases from your dashboard when work is available, with the project's rubric beside each one. Work at your own pace; your answers are saved as you go.",
  },
  {
    title: "Your work is checked and recorded",
    body: "Other clinicians read the same items, and written answers are reviewed by a colleague. Every pass you make appears on your work record and is paid on the terms agreed with you.",
  },
];

/** What we ask of a clinician. No geography is listed because none is enforced. */
export const ELIGIBILITY = [
  "A current clinical licence",
  "Active practice in a clinical specialty",
  "Comfort reading and assessing written cases",
  "A computer and a reliable internet connection",
];

/**
 * What we expect of contributors and what we commit to in return. Every
 * line is a term of the agreement or behaviour the platform enforces.
 */
export const STANDARDS = [
  {
    title: "Accuracy over speed",
    body: "There are no targets. Judge each case against the project's rubric and the standard of care you practise to, and take the time it needs.",
  },
  {
    title: "Flag rather than guess",
    body: "If a case is outside your area, unclear, or the rubric conflicts with your clinical judgment, flag it. A flag is recorded as work.",
  },
  {
    title: "Safety first",
    body: "Call out anything in an answer that could harm a patient, even when the rest of it is right.",
  },
  {
    title: "Consistency",
    body: "Apply the same rubric the same way across cases, so your readings can be compared with other clinicians'.",
  },
];

export const TRUST = [
  {
    title: "Confidential case material",
    body: "Cases stay inside the platform and may contain de-identified patient information. You agree not to copy, retain, discuss or try to re-identify anything you read.",
  },
  {
    title: "Access by project",
    body: "You see only the projects you have been given access to. The platform enforces that on every request, and access can be withdrawn.",
  },
  {
    title: "Independent and anonymous",
    body: "You work independently of the organisations whose systems are evaluated, and your identity is never disclosed to them.",
  },
];

/** How pay works, stated only as far as the agreement goes. */
export const PAY_POINTS = [
  {
    title: "Agreed before you start",
    body: "Your rate and payment schedule are agreed with you in writing before you begin. They are not published on the site or in the platform.",
  },
  {
    title: "Every pass counts",
    body: "Each case you judge, label or write is recorded, and so is each case you flag and each answer you review, including ones you send back.",
  },
  {
    title: "A record you can check",
    body: "Your work record lists every pass by kind, project and date. The platform does not yet show rates, balances or statements.",
  },
];
