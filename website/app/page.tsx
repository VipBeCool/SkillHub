import SkillHubLanding from "../components/SkillHubLanding";
import { getBuildTimeRepoMeta } from "../lib/changelog";

export default function HomePage() {
  const { packageVersion, latestChangelogVersion, releases } = getBuildTimeRepoMeta();

  return (
    <SkillHubLanding
      latestChangelogVersion={latestChangelogVersion}
      packageVersion={packageVersion}
      releases={releases}
    />
  );
}
