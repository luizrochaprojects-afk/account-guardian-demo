import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface PageHeaderProps {
  title?: string;
  description?: string;
  /**
   * The description is usually a live count ("12 accounts · $48k under
   * management"). Rendering it from a still-loading query prints a confident
   * "0 accounts · $0" that is simply wrong, so the caller passes its loading
   * flag and gets the line's shape instead of a false figure.
   */
  descriptionLoading?: boolean;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  chip?: React.ReactNode;
}

export function PageHeader({ title, description, descriptionLoading, breadcrumbs, actions, chip }: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-6 shrink-0", title ? "py-4" : "py-2.5")}>
      <div className="space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {crumb.href ? (
                      <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
        {title && (
          <>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              {chip}
            </div>
            {descriptionLoading ? (
              <div role="status" aria-live="polite" className="py-0.5">
                <span className="sr-only">Loading summary</span>
                <Skeleton className="h-4 w-56" />
              </div>
            ) : (
              description && <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
