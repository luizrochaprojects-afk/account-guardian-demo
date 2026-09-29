import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { HealthConfigureTab } from '@/components/health/HealthConfigureTab';
import { HealthProfilesTab } from '@/components/health/HealthProfilesTab';
import { HealthLogTab } from '@/components/health/HealthLogTab';
import { HealthMonitorTab } from '@/components/health/HealthMonitorTab';

const VALID_TABS = new Set(['configure', 'profiles', 'log', 'monitor']);

export default function HealthConfig() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('tab');
  const [tab, setTab] = useState(initial && VALID_TABS.has(initial) ? initial : 'configure');

  useEffect(() => {
    const next = searchParams.get('tab');
    if (next && VALID_TABS.has(next) && next !== tab) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleChange = (val: string) => {
    setTab(val);
    const next = new URLSearchParams(searchParams);
    next.set('tab', val);
    setSearchParams(next, { replace: true });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          title="Health Score"
          description="Configure, log, and monitor account health"
        />
        <div className="flex-1 overflow-y-auto p-6 pt-0">
          <div className="max-w-[1200px]">
            <Tabs data-tour="health" value={tab} onValueChange={handleChange}>
              <TabsList className="mb-4">
                <TabsTrigger value="configure">Configure</TabsTrigger>
                <TabsTrigger value="profiles">Profiles</TabsTrigger>
                <TabsTrigger value="log">Log Update</TabsTrigger>
                <TabsTrigger value="monitor">Monitor</TabsTrigger>
              </TabsList>

              <TabsContent value="configure">
                <HealthConfigureTab />
              </TabsContent>

              <TabsContent value="profiles">
                <HealthProfilesTab />
              </TabsContent>

              <TabsContent value="log">
                <HealthLogTab />
              </TabsContent>

              <TabsContent value="monitor">
                <HealthMonitorTab />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
