import { apiClient } from "../../lib/api";

export type BrandingImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export type BrandingSnapshot = {
  displayName: string;
  shortName: string | null;
  logoUrl: string | null;
  logoMimeType: BrandingImageMimeType | null;
  hasLogo: boolean;
  version: number;
};

export type UpdateBrandingPayload = {
  displayName: string;
  shortName: string | null;
  version: number;
};

export type UploadBrandingLogoPayload = {
  file: File;
  version: number;
};

type ApiEnvelope<T> = { data: T };
const headers = (accessToken: string | null) =>
  accessToken ? { authorization: `Bearer ${accessToken}` } : undefined;

export const brandingService = {
  async getBranding(): Promise<BrandingSnapshot> {
    const response =
      await apiClient.get<ApiEnvelope<BrandingSnapshot>>("/branding");
    return response.data;
  },

  async updateBranding(
    payload: UpdateBrandingPayload,
    accessToken: string | null,
  ): Promise<BrandingSnapshot> {
    const response = await apiClient.put<
      ApiEnvelope<BrandingSnapshot>,
      UpdateBrandingPayload
    >("/branding", { body: payload, headers: headers(accessToken) });
    return response.data;
  },

  async uploadLogo({
    file,
    version,
  }: UploadBrandingLogoPayload, accessToken: string | null): Promise<BrandingSnapshot> {
    const body = new FormData();
    body.append("logo", file);
    body.append("version", String(version));
    const response = await apiClient.post<ApiEnvelope<BrandingSnapshot>, FormData>(
      "/branding/logo",
      { body, headers: headers(accessToken) },
    );
    return response.data;
  },

  async removeLogo(
    version: number,
    accessToken: string | null,
  ): Promise<BrandingSnapshot> {
    const response = await apiClient.delete<ApiEnvelope<BrandingSnapshot>>(
      "/branding/logo?version=" + encodeURIComponent(String(version)),
      { headers: headers(accessToken) },
    );
    return response.data;
  },
};
