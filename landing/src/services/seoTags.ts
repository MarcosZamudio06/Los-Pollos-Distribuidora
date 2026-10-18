import { publicUrl } from "../config/publicUrl.ts";
export function getPublicSeo(canonical: string | undefined, socialImage: string | undefined) {
  return { canonical: publicUrl(canonical), socialImage: publicUrl(socialImage) };
}
