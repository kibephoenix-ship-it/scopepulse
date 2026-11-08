import ShareProposal from "./share-proposal";

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ShareProposal slug={slug} />;
}
