-- Simplify access requests to what a stranger can reasonably be asked.
--
-- A request comes from someone who found the site, not from a referral, so
-- "referred by" was asking for something almost nobody has. And a licence type
-- is a question for the conversation that follows a promising request, not a
-- gate on sending one. What remains is name, email, specialty and country, with
-- an optional LinkedIn profile as the quickest way to assess who someone is.
--
-- The email can be a personal address. Nothing here assumes an institutional
-- domain, and the lowercase CHECK from migration 012 still applies.

alter table access_requests drop column if exists credential;
alter table access_requests drop column if exists referred_by;

-- The optional link is specifically LinkedIn now, so the column says so. A
-- column named for any profile while the API only accepted LinkedIn would be a
-- name broader than what it holds.
alter table access_requests rename column profile_url to linkedin_url;

-- Replace the generic http(s) check with one that holds the same line the API
-- does: an https URL on linkedin.com or one of its subdomains. It is rendered as
-- a link in the operator console, so this is also what keeps anything else —
-- javascript: included, or a lookalike host such as linkedin.com.example.org —
-- out of that link.
alter table access_requests drop constraint if exists access_requests_profile_url_check;
alter table access_requests add constraint access_requests_linkedin_url_check check (
  linkedin_url is null
  or (
    char_length(linkedin_url) <= 500
    and linkedin_url ~* '^https://([a-z0-9-]+\.)*linkedin\.com(/|$)'
  )
);
