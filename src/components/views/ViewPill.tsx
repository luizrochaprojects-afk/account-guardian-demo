import { Pencil, X } from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export function ViewPill({ name }: { name: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const clear = () => {
    // Strip ?view= and all filter params, keep pathname
    navigate(location.pathname, { replace: true });
  };

  const editDetails = () => {
    const next = new URLSearchParams(searchParams);
    next.set("edit", "1");
    setSearchParams(next, { replace: true });
  };

  return (
    <Badge variant="secondary" className="gap-1.5 h-6 pl-2 pr-1 text-[11px] font-normal">
      <span className="text-muted-foreground">Viewing:</span>
      <span className="font-medium truncate max-w-[180px]">{name}</span>
      <button
        onClick={editDetails}
        className="ml-0.5 p-0.5 rounded-sm hover:bg-muted-foreground/20"
        title="Edit view details"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        onClick={clear}
        className="ml-0.5 p-0.5 rounded-sm hover:bg-muted-foreground/20"
        title="Clear view"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}