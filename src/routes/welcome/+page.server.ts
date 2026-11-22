// /welcome — a signed-in user with no company creates one (FE.company.create). Also reachable later to add another.
export const load = ({ locals }) => ({
  email: locals.user,
  hasCompany: !!locals.identity?.memberships.length
});
