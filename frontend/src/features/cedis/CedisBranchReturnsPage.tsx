import { PageContainer } from "../../components/layout/PageContainer";
import { BranchReturnsView } from "../inventario/components/BranchReturnsView";

export function CedisBranchReturnsPage() {
  return (
    <PageContainer>
      <section className="mx-auto flex max-w-[96rem] flex-col gap-6">
        <BranchReturnsView />
      </section>
    </PageContainer>
  );
}
