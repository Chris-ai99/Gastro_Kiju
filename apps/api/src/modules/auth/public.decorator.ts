import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_ENDPOINT = "kiju:is-public-endpoint";
export const PublicEndpoint = () => SetMetadata(IS_PUBLIC_ENDPOINT, true);
