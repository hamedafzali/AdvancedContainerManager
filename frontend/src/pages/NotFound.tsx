import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Card, EmptyState, Button } from "@/components/ui";

export default function NotFound() {
  return (
    <Card padded={false}>
      <EmptyState
        icon={<Compass className="w-6 h-6" />}
        title="Page not found"
        description="The page you are looking for doesn't exist or has moved."
        action={
          <Link to="/dashboard">
            <Button variant="primary">Back to Dashboard</Button>
          </Link>
        }
      />
    </Card>
  );
}
