import { getSiteStatsService } from "@/server/modules/site-stats";
import { logError } from "@/server/http/logger";
import WelcomeScreen from "@/components/layout/WelcomeScreen";
import HomeClient from "./HomeClient";

export const revalidate = 60;

async function fetchProfileData() {
  try {
    return await getSiteStatsService().get();
  } catch (error) {
    logError("Failed to load homepage stats", error);
    return { postCount: 0, chatterCount: 0, photoCount: 0 };
  }
}

export default async function Home() {
  const { postCount, chatterCount, photoCount } = await fetchProfileData();

  return (
    <>
      {process.env.WELCOME_DISABLED === "1" ? null : <WelcomeScreen />}
      <HomeClient
        postCount={postCount}
        chatterCount={chatterCount}
        photoCount={photoCount}
      />
    </>
  );
}
