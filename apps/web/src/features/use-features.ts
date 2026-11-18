import { createContext, useContext } from "react";
import { ALL_FLAGS_OFF, type Features } from "./features-schema";

/** No default provider: without one, every flag is off (Req 2.7). */
export const FeaturesContext = createContext<Features>(ALL_FLAGS_OFF);

export function useFeatures(): Features {
  return useContext(FeaturesContext);
}
