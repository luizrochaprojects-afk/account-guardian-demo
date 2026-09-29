import { useLocation, Link } from "react-router-dom";
import { SearchX } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader title="Page not found" />
        <div className="flex-1 overflow-auto flex items-center justify-center">
          <EmptyState
            icon={SearchX}
            title="Page not found"
            description={`We couldn't find ${location.pathname}.`}
            action={
              <Button size="sm" variant="outline" asChild>
                <Link to="/dashboard">Back to Dashboard</Link>
              </Button>
            }
          />
        </div>
      </div>
    </AppLayout>
  );
};

export default NotFound;
