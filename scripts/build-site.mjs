// Generates the public website (www.kuulapp.com) into public/site/ from one layout,
// so every page shares the same header, navigation and footer. Run after editing:
//   node scripts/build-site.mjs
// The output is committed; scripts/serve-web.mjs serves it for the website hosts.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "site");
const APP = "https://app.kuulapp.com";
const APPLY = `${APP}/#/create-account`;
const SIGN_IN = `${APP}/#/welcome`;
const APR = 0.336;

// Priced exactly as the API prices a loan (server/src/lib/pricing.ts): simple interest,
// principal x APR x days / 365, rounded to the shilling, no fees.
const quote = (principal, days) => {
  const interest = Math.round(principal * (APR / 365) * days);
  return { principal, days, interest, total: principal + interest };
};
const ugx = (value) => `UGX ${value.toLocaleString("en-US")}`;

const NAV = [
  ["/business-loans", "Business loans"],
  ["/how-it-works", "How it works"],
  ["/pricing", "Pricing"],
  ["/eligibility", "Who can apply"],
  ["/about", "About"],
  ["/faq", "FAQs"],
  ["/contact", "Contact"],
];

function layout({ slug, title, description, body }) {
  const href = slug === "index" ? "/" : `/${slug}`;
  const current = (link) => (link === href ? ' aria-current="page"' : "");
  const navLinks = NAV.map(([link, label]) => `<a href="${link}"${current(link)}>${label}</a>`).join("");
  const pageTitle = slug === "index" ? "Kuula: business loans for Uganda's traders and growing businesses" : `${title} | Kuula`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#0b5e3a">
<link rel="canonical" href="https://www.kuulapp.com${href}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Kuula">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="https://www.kuulapp.com${href}">
<link rel="icon" href="/kuula-icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/site/site.css">
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/"><img src="/kuula-icon.svg" alt="" width="36" height="36">Kuula</a>
    <nav class="nav" aria-label="Main">${navLinks}</nav>
    <div class="header-actions">
      <a class="button button-quiet" href="${SIGN_IN}">Sign in</a>
      <a class="button button-primary" href="${APPLY}">Apply now</a>
    </div>
    <details class="menu">
      <summary>Menu</summary>
      <nav class="menu-panel" aria-label="Main">${NAV.map(([link, label]) => `<a href="${link}"${current(link)}>${label}</a>`).join("")}<a href="${SIGN_IN}">Sign in</a><a class="button button-primary" href="${APPLY}">Apply now</a></nav>
    </details>
  </div>
</header>
<main id="content">
${body.trim()}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <h2>Kuula Microfinance Limited</h2>
        <p>Business loans for traders, shop owners and growing businesses in Uganda. Business lending only; every loan is subject to review and approval.</p>
      </div>
      <div>
        <h2>Borrowing</h2>
        <ul>
          <li><a href="/business-loans">Business loans</a></li>
          <li><a href="/how-it-works">How it works</a></li>
          <li><a href="/pricing">Pricing</a></li>
          <li><a href="/eligibility">Who can apply</a></li>
        </ul>
      </div>
      <div>
        <h2>Company</h2>
        <ul>
          <li><a href="/about">About Kuula</a></li>
          <li><a href="/faq">FAQs</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </div>
      <div>
        <h2>Your account</h2>
        <ul>
          <li><a href="${APPLY}">Create an account</a></li>
          <li><a href="${SIGN_IN}">Sign in</a></li>
          <li><a href="${APP}/#/customer-privacy-policy">Privacy policy</a></li>
          <li><a href="${APP}/#/customer-terms">Terms of service</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-legal">
      <span>&copy; 2026 Kuula Microfinance Limited. All rights reserved.</span>
      <span>Kuula never asks for your PIN by phone, SMS or email.</span>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

const example = quote(1_000_000, 90);
const closing = (heading, text, [secondaryHref, secondaryLabel] = ["/how-it-works", "See how it works"]) => `
<section class="closing">
  <div class="wrap">
    <h2>${heading}</h2>
    <p>${text}</p>
    <div class="actions">
      <a class="button button-primary" href="${APPLY}">Apply now</a>
      <a class="button button-on-dark" href="${secondaryHref}">${secondaryLabel}</a>
    </div>
  </div>
</section>`;

const pages = [
  {
    slug: "index",
    title: "Home",
    description: "Kuula lends to traders, shop owners and growing businesses in Uganda for stock, working capital, equipment and expansion, with the full cost shown before you accept.",
    body: `
<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <h1>Business loans with the cost written down before you say yes.</h1>
      <p class="lede">Kuula lends to traders, shop owners and growing businesses in Uganda. Apply on your phone, get reviewed by a real credit team, and receive the money on MTN or Airtel Mobile Money.</p>
      <div class="actions">
        <a class="button button-primary" href="${APPLY}">Apply now</a>
        <a class="button button-quiet" href="/pricing">See what a loan costs</a>
      </div>
      <p class="small-print">Business lending only. Every application is reviewed, and not every application is approved.</p>
    </div>
    <div>
      <div class="receipt" role="figure" aria-label="Example loan cost">
        <div class="receipt-head"><strong>Example loan</strong><span>90 days</span></div>
        <dl>
          <dt>You borrow</dt><dd>${ugx(example.principal)}</dd>
          <dt>Interest, 33.6% a year</dt><dd>${ugx(example.interest)}</dd>
          <dt>Fees</dt><dd>UGX 0</dd>
          <dt class="total">You repay in total</dt><dd class="total">${ugx(example.total)}</dd>
        </dl>
        <p class="note">Worked out the same way as your real offer: simple interest on the amount borrowed, for the days you borrow it. Your amount and term depend on your review.</p>
      </div>
    </div>
  </div>
</section>

<section class="section band">
  <div class="wrap">
    <div class="section-head">
      <h2>Money for the work your business already does.</h2>
      <p>Kuula is for businesses that are already trading. Loans are for a productive business purpose, not personal spending.</p>
    </div>
    <div class="uses">
      <div class="use"><h3>Stock</h3><p>Restock shelves before market days, holidays and the school term, when customers come in.</p></div>
      <div class="use"><h3>Working capital</h3><p>Cover rent, transport and supplier payments while you wait for your own customers to pay.</p></div>
      <div class="use"><h3>Equipment</h3><p>Buy or repair the tools, machines and fittings that your business depends on.</p></div>
      <div class="use"><h3>Growth</h3><p>Open a second stall, add a product line or take on a larger order.</p></div>
    </div>
    <p><a href="/business-loans">More about Kuula business loans</a></p>
  </div>
</section>

<section class="section">
  <div class="wrap two">
    <div>
      <h2>From application to Mobile Money</h2>
      <p>Kuula does not promise instant approval. A credit officer looks at your business, and you see the full cost and the agreement before any money moves.</p>
      <p><a href="/how-it-works">Read the whole process</a></p>
    </div>
    <ol class="steps steps-compact">
      <li><div><h3>Create your account</h3><p>Verify your phone number and your National ID.</p></div></li>
      <li><div><h3>Tell us about your business</h3><p>What you sell, where you trade, and your monthly sales and costs.</p></div></li>
      <li><div><h3>Get reviewed and receive an offer</h3><p>Our credit team checks your application and may visit your business.</p></div></li>
      <li><div><h3>Accept and get paid</h3><p>Read and accept the agreement; the money is sent to your Mobile Money.</p></div></li>
    </ol>
  </div>
</section>

<section class="section band">
  <div class="wrap two">
    <div>
      <h2>Lending that fits a business, not a payslip.</h2>
      <p>Kuula looks at what your business earns after its costs, your trading history and what you already owe. Your first loan is sized carefully, and your limit grows as you repay on time.</p>
    </div>
    <div class="aside-box">
      <h3>What we will never do</h3>
      <ul class="checks">
        <li>Charge fees that are not in your offer.</li>
        <li>Send money before you accept the agreement.</li>
        <li>Ask for your PIN by phone, SMS or email.</li>
      </ul>
    </div>
  </div>
</section>
${closing("Ready to grow your business?", "Create your account in a few minutes and apply when you are ready.")}
`,
  },
  {
    slug: "business-loans",
    title: "Business loans",
    description: "Kuula business loans for stock, working capital, equipment and expansion: 30 to 365 days, paid to MTN or Airtel Mobile Money, repaid in part or in full.",
    body: `
<section class="page-head"><div class="wrap">
  <h1>Business loans</h1>
  <p>Short-term loans for businesses that are already trading, for stock, working capital, equipment and growth.</p>
</div></section>

<section class="section">
  <div class="wrap">
    <div class="section-head"><h2>What you can use a Kuula loan for</h2></div>
    <div class="uses">
      <div class="use"><h3>Stock and inventory</h3><p>Buy goods to sell, from produce and household items to hardware, clothing and phone accessories.</p></div>
      <div class="use"><h3>Working capital</h3><p>Pay suppliers, rent and transport while your own customers settle what they owe you.</p></div>
      <div class="use"><h3>Equipment and tools</h3><p>Buy, upgrade or repair equipment such as freezers, sewing machines, salon chairs or tools.</p></div>
      <div class="use"><h3>Expansion</h3><p>Fund a new product line, a second location or a larger order that your business can deliver.</p></div>
    </div>
  </div>
</section>

<section class="section band">
  <div class="wrap two">
    <div>
      <h2>The loan at a glance</h2>
      <ul class="checks">
        <li>Terms from 30 to 365 days.</li>
        <li>Simple interest at 33.6% a year, and no fees.</li>
        <li>Paid to your MTN or Airtel Mobile Money number.</li>
        <li>Repay in part or in full through Mobile Money, at any time before the due date.</li>
        <li>The full cost and the due date are in your offer before you accept.</li>
      </ul>
      <p><a href="/pricing">See worked examples on the pricing page</a></p>
    </div>
    <div class="aside-box">
      <h3>How much you can borrow</h3>
      <p>Your limit is set during your review from what your business earns after its costs, your trading history and your existing debts.</p>
      <p>First loans are deliberately modest. Each loan you repay on time can raise the limit for your next one.</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap two">
    <div>
      <h2>Business lending only</h2>
      <p>Kuula does not offer personal, salary or emergency loans, and it does not take savings or deposits. Every loan must be for a business purpose that the business can repay from its own trading.</p>
    </div>
    <div>
      <h2>Formal or informal</h2>
      <p>You do not need a registered company. Market vendors, home-based businesses and registered companies can all apply. What matters is a real, ongoing trading activity that we can verify.</p>
    </div>
  </div>
</section>
${closing("Find out what you could borrow", "Apply on your phone. You will see your offer and its full cost before you decide.")}
`,
  },
  {
    slug: "how-it-works",
    title: "How it works",
    description: "How a Kuula business loan works, step by step: account, identity check, business details, credit review, offer and agreement, Mobile Money payout and repayment.",
    body: `
<section class="page-head"><div class="wrap">
  <h1>How it works</h1>
  <p>Every step from creating your account to repaying your loan, and what happens at each one.</p>
</div></section>

<section class="section">
  <div class="wrap">
    <ol class="steps">
      <li><div><h3>Create your account</h3><p>Sign up with your phone number and set a 4-digit PIN. We send a code by SMS to confirm the number is yours.</p></div></li>
      <li><div><h3>Verify your identity</h3><p>Enter your National ID details and take photos of the front and back of your ID and of yourself. Our team checks them; this protects you from anyone borrowing in your name.</p></div></li>
      <li><div><h3>Tell us about your business</h3><p>What you sell, where you trade, how long you have been trading, and your usual monthly sales, costs and existing loans. Honest figures lead to a loan you can comfortably repay.</p></div></li>
      <li><div><h3>Choose an amount and term</h3><p>Pick how much you need and for how long, from 30 to 365 days, and say what the money is for. You see the interest and total repayable before you submit.</p></div></li>
      <li><div><h3>Credit review</h3><p>A credit officer reviews your application and may visit your business. A senior reviewer and a final approver check the recommendation. This is a review by people, not an automatic score.</p></div></li>
      <li><div><h3>Receive your offer</h3><p>If approved, you get an offer showing the amount, interest, total repayable and due date. Read the loan agreement and accept it only if you are happy with it.</p></div></li>
      <li><div><h3>Get paid to Mobile Money</h3><p>After you accept, Kuula's finance team authorises the payment and the money is sent to your registered MTN or Airtel Mobile Money number.</p></div></li>
      <li><div><h3>Repay</h3><p>Repay from the app at any time before the due date, in part or in full. You approve each payment on your phone, and you receive a receipt once the payment is confirmed.</p></div></li>
    </ol>
  </div>
</section>

<section class="section band">
  <div class="wrap two">
    <div>
      <h2>How long does it take?</h2>
      <p>Creating an account takes a few minutes. The review takes longer, because a person checks your business, sometimes with a visit. We will tell you in the app when your application moves forward or if we need anything else.</p>
    </div>
    <div class="aside-box">
      <h3>If a payment seems stuck</h3>
      <p>Do not pay twice. Kuula confirms every Mobile Money payment with the provider and updates your balance as soon as it is confirmed. If it has not updated after a day, <a href="/contact">contact support</a>.</p>
    </div>
  </div>
</section>
${closing("Start your application", "It begins with a free account. Nothing is charged until you accept an offer and receive the money.", ["/pricing", "See pricing"])}
`,
  },
  {
    slug: "pricing",
    title: "Pricing",
    description: "Kuula pricing: simple interest at 33.6% a year, no fees, terms of 30 to 365 days. Worked examples show exactly what you repay.",
    body: `
<section class="page-head"><div class="wrap">
  <h1>Pricing</h1>
  <p>One rate, no fees, and the full cost in writing before you accept.</p>
</div></section>

<section class="section">
  <div class="wrap two">
    <div>
      <p class="figure">33.6% a year</p>
      <p>Simple interest, charged only on the amount you borrow and only for the days in your loan term. There are no application, processing or disbursement fees.</p>
      <p>Interest is worked out as: amount borrowed &times; 33.6% &times; days &divide; 365, rounded to the nearest shilling.</p>
    </div>
    <div class="aside-box">
      <h3>What is not charged</h3>
      <ul class="checks">
        <li>No application fee.</li>
        <li>No processing or disbursement fee.</li>
        <li>No fees beyond the interest shown in your offer.</li>
      </ul>
      <p>Your Mobile Money provider may charge its own transaction fees under its tariffs.</p>
    </div>
  </div>
</section>

<section class="section band">
  <div class="wrap">
    <div class="section-head">
      <h2>Worked examples</h2>
      <p>These are calculated exactly the way your offer is calculated. The amount and term you are offered depend on your review.</p>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th scope="col">You borrow</th><th scope="col">Term</th><th scope="col">Interest</th><th scope="col">Fees</th><th scope="col">You repay</th></tr></thead>
        <tbody>
${[quote(300_000, 30), quote(500_000, 60), quote(1_000_000, 90), quote(2_000_000, 180)].map((q) => `          <tr><td>${ugx(q.principal)}</td><td>${q.days} days</td><td>${ugx(q.interest)}</td><td>UGX 0</td><td class="strong">${ugx(q.total)}</td></tr>`).join("\n")}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap two">
    <div>
      <h2>Repaying</h2>
      <p>Repay through Mobile Money from the app, in part or in full, at any time before your due date. Each payment is applied first to interest and then to the amount borrowed, and you get a receipt once it is confirmed.</p>
    </div>
    <div>
      <h2>Before you accept</h2>
      <p>Your offer states the amount, interest, total to repay and due date, and the loan agreement sets out your rights and obligations. Read both. If anything is unclear, <a href="/contact">ask us</a> before you accept.</p>
    </div>
  </div>
</section>
${closing("See your own offer", "Apply to find out the amount and term available to your business.")}
`,
  },
  {
    slug: "eligibility",
    title: "Who can apply",
    description: "Who can apply for a Kuula business loan and what you need: a Ugandan National ID, a Mobile Money number, an active business and honest business figures.",
    body: `
<section class="page-head"><div class="wrap">
  <h1>Who can apply</h1>
  <p>Kuula lends to people who already run a business in Uganda, formally registered or not.</p>
</div></section>

<section class="section">
  <div class="wrap two">
    <div>
      <h2>You can apply if you</h2>
      <ul class="checks">
        <li>Run a business that is trading today, with products or services and customers.</li>
        <li>Have a valid Ugandan National ID.</li>
        <li>Have a phone number registered for MTN or Airtel Mobile Money in your name.</li>
        <li>Can describe your sales, costs and any loans you already have.</li>
        <li>Need the money for a business purpose.</li>
      </ul>
    </div>
    <div class="aside-box">
      <h3>Have these ready</h3>
      <ul>
        <li>Your National ID card, to photograph the front and back.</li>
        <li>Your business name, location and what you sell.</li>
        <li>Your usual monthly sales and business costs.</li>
        <li>Details of any loans you are repaying.</li>
      </ul>
    </div>
  </div>
</section>

<section class="section band">
  <div class="wrap">
    <div class="section-head">
      <h2>How we decide</h2>
      <p>We lend only what your business can repay from its own trading. A loan you cannot repay would hurt your business, so we look carefully.</p>
    </div>
    <div class="uses">
      <div class="use"><h3>What your business keeps</h3><p>Your sales minus your business costs, not just your sales.</p></div>
      <div class="use"><h3>Your existing debts</h3><p>Repayments you already make to other lenders.</p></div>
      <div class="use"><h3>Your trading history</h3><p>How long you have traded and what our credit officer finds when they review your business.</p></div>
      <div class="use"><h3>Your record with Kuula</h3><p>Loans repaid on time raise the limit for your next loan.</p></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap two">
    <div>
      <h2>If you are not approved</h2>
      <p>We will tell you in the app. A decline is not a judgement of you; it usually means the loan requested is larger than the business can safely repay right now. You can apply again later, for example once your business has grown or your existing debts are lower.</p>
    </div>
    <div>
      <h2>Kuula does not lend for</h2>
      <p>Personal spending, school fees, medical bills, salary advances or repaying other debts. These are important needs, but they are outside what Kuula is set up to lend for.</p>
    </div>
  </div>
</section>
${closing("Check if your business qualifies", "Create your account and start an application. You can stop at any point before you accept an offer.")}
`,
  },
  {
    slug: "about",
    title: "About",
    description: "About Kuula Microfinance Limited: business lending for Uganda's traders and small businesses, built on clear pricing and review by people.",
    body: `
<section class="page-head"><div class="wrap">
  <h1>About Kuula</h1>
  <p>Kuula Microfinance Limited provides business loans to traders, shop owners and growing businesses in Uganda.</p>
</div></section>

<section class="section">
  <div class="wrap two">
    <div>
      <h2>Why Kuula exists</h2>
      <p>Most of Uganda's businesses are small: a stall, a shop, a workshop, a salon. They often need a little capital at the right moment to restock or take on an order, and too often the only options are expensive, unclear or hard to reach.</p>
      <p>Kuula offers a business loan you can apply for on your phone, at a price written down before you accept, with the money paid to the Mobile Money account you already use.</p>
    </div>
    <div>
      <h2>How we lend</h2>
      <ul class="checks">
        <li>Business loans only, for a business purpose.</li>
        <li>One clear rate and no hidden fees.</li>
        <li>Every application reviewed by people, with independent approval.</li>
        <li>Loans sized to what the business can repay.</li>
        <li>Identity checked to protect customers from fraud.</li>
      </ul>
    </div>
  </div>
</section>

<section class="section band">
  <div class="wrap two">
    <div>
      <h2>Your information</h2>
      <p>We collect what we need to verify your identity and assess your application, keep identity photos in encrypted storage, and limit who on our team can see them. Read our <a href="${APP}/#/customer-privacy-policy">privacy policy</a> for the details.</p>
    </div>
    <div>
      <h2>Responsible borrowing</h2>
      <p>Borrow only what your business needs and can repay. If you expect to have trouble repaying, contact us early: it is always easier to find a way forward before a payment is missed.</p>
    </div>
  </div>
</section>
${closing("Talk to us or apply", "Have a question about your business and a Kuula loan? Our team is happy to help.")}
`,
  },
  {
    slug: "faq",
    title: "FAQs",
    description: "Answers to common questions about Kuula business loans: eligibility, cost, terms, Mobile Money payouts, repayment, security and privacy.",
    body: `
<section class="page-head"><div class="wrap">
  <h1>Frequently asked questions</h1>
  <p>If your question is not here, <a href="/contact">contact our support team</a>.</p>
</div></section>

<section class="section">
  <div class="wrap faq">
    <h2>Applying</h2>
    <details><summary>Do I need a registered company?</summary><p>No. Informal businesses such as market stalls and home-based businesses can apply, as can registered companies. You need a real business that is trading today.</p></details>
    <details><summary>What do I need to apply?</summary><p>A valid Ugandan National ID, a phone number registered for MTN or Airtel Mobile Money in your name, and details of your business: what you sell, where, and your usual monthly sales and costs.</p></details>
    <details><summary>How long does a decision take?</summary><p>A person reviews every application, sometimes with a visit to your business, so it is not instant. The app shows where your application is and tells you if we need anything else.</p></details>
    <details><summary>Can I get a personal or salary loan?</summary><p>No. Kuula lends only to businesses, for a business purpose.</p></details>

    <h2>Cost and repayment</h2>
    <details><summary>How much does a loan cost?</summary><p>Simple interest at 33.6% a year on the amount you borrow, for the days you borrow it, with no fees. For example, UGX 1,000,000 for 90 days costs UGX 82,849 in interest. See the <a href="/pricing">pricing page</a> for more examples.</p></details>
    <details><summary>How long can I borrow for?</summary><p>From 30 to 365 days. You choose the term when you apply, and the offer confirms it.</p></details>
    <details><summary>How do I repay?</summary><p>From the app, through MTN or Airtel Mobile Money. You can pay part or all of what you owe at any time before the due date, and you approve each payment on your phone.</p></details>
    <details><summary>My payment went through but my balance has not changed.</summary><p>Kuula updates your balance once Mobile Money confirms the payment, which is usually within minutes. Do not pay again. If it has not updated within a day, contact support with the payment reference.</p></details>

    <h2>Money and security</h2>
    <details><summary>Where is the loan paid?</summary><p>To the MTN or Airtel Mobile Money number registered on your Kuula account, after you accept the offer and the agreement.</p></details>
    <details><summary>Will Kuula ever ask for my PIN?</summary><p>Never. Kuula staff will not ask for your PIN or your Mobile Money PIN by phone, SMS or email. If someone does, do not share it and contact us.</p></details>
    <details><summary>How is my information protected?</summary><p>Identity photos are kept in encrypted storage, only authorised staff can view them, and each view is recorded. See our <a href="${APP}/#/customer-privacy-policy">privacy policy</a>.</p></details>
  </div>
</section>
${closing("Still deciding?", "Create an account and look around. Nothing is charged until you accept an offer.")}
`,
  },
  {
    slug: "contact",
    title: "Contact",
    description: "Contact Kuula: support for applications and repayments, complaints, and privacy requests.",
    body: `
<section class="page-head"><div class="wrap">
  <h1>Contact Kuula</h1>
  <p>Write to the team that can help you directly. Include your registered phone number so we can find your account; never send your PIN.</p>
</div></section>

<section class="section">
  <div class="wrap contacts">
    <div>
      <h3>Customer support</h3>
      <p>Applications, offers, payments and your account.</p>
      <p><a href="mailto:support@kuulapp.com">support@kuulapp.com</a></p>
    </div>
    <div>
      <h3>Complaints</h3>
      <p>If something went wrong and you want it put right.</p>
      <p><a href="mailto:complaints@kuulapp.com">complaints@kuulapp.com</a></p>
    </div>
    <div>
      <h3>Privacy</h3>
      <p>Questions about your personal data, or a request to see or delete it.</p>
      <p><a href="mailto:privacy@kuulapp.com">privacy@kuulapp.com</a></p>
    </div>
  </div>
</section>

<section class="section band">
  <div class="wrap two">
    <div>
      <h2>Already a customer?</h2>
      <p>The fastest way to reach us about a loan or payment is from the app, where our team can see your application. <a href="${SIGN_IN}">Sign in to the app</a>.</p>
    </div>
    <div class="aside-box">
      <h3>Protect yourself</h3>
      <p>Kuula will never ask for your PIN or your Mobile Money PIN, and never asks you to send money to a personal number to unlock a loan. If someone does, it is not Kuula.</p>
    </div>
  </div>
</section>
`,
  },
  {
    slug: "404",
    title: "Page not found",
    description: "This page does not exist on the Kuula website.",
    body: `
<section class="not-found">
  <div class="wrap">
    <h1>This page does not exist.</h1>
    <p>The link may be old or mistyped. Go to the <a href="/">home page</a>, read about <a href="/business-loans">business loans</a>, or <a href="/contact">contact us</a>.</p>
  </div>
</section>
`,
  },
];

mkdirSync(outDir, { recursive: true });
for (const page of pages) {
  writeFileSync(path.join(outDir, `${page.slug}.html`), layout(page));
}
console.log(`Wrote ${pages.length} pages to ${path.relative(root, outDir)}`);
