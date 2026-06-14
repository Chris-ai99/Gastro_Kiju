import { SelfOrderPage } from "../../../components/self-order-page";

type PageProps = {
  params: Promise<{ accessKey: string }>;
};

export default async function PublicSelfOrderPage({ params }: PageProps) {
  const { accessKey } = await params;
  return <SelfOrderPage accessKey={accessKey} />;
}
