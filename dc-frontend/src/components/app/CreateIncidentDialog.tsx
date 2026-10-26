import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, FormField, Input, Select, Textarea } from '@/components/ui';
import { incidentSchema, type IncidentValues } from '@/schemas/forms';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { errorMessage } from '@/services/api';
import { categoryLabels } from '@/utils/analytics';

export function CreateIncidentDialog({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults?: Partial<IncidentValues> }) {
  const { workspace, createIncident } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();
  const { register, handleSubmit, watch, reset, setValue, setError, formState: { errors, isSubmitting } } = useForm<IncidentValues>({
    resolver: zodResolver(incidentSchema),
    defaultValues: { title: '', description: '', severity: 'major', category: 'hardware', rackId: '', serverIds: [], assigneeId: '', ...defaults },
  });
  useEffect(() => {
    if (open) reset({ title: '', description: '', severity: 'major', category: 'hardware', rackId: workspace?.racks[0]?.id ?? '', serverIds: [], assigneeId: '', ...defaults });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const rackId = watch('rackId');
  const serverIds = watch('serverIds');
  const servers = workspace?.servers.filter((s) => s.rackId === rackId) ?? [];
  const noRacks = !workspace?.racks.length;

  const onSubmit = async (v: IncidentValues) => {
    try {
      const inc = await createIncident({ ...v, rackId: v.rackId, assigneeId: v.assigneeId || null });
      toast.success(`${inc.id} created`, inc.title);
      onClose();
      navigate(`/app/incidents/${inc.id}`);
    } catch (e) {
      setError('root', { message: errorMessage(e) });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Create incident"
      description="Record an issue so the team can track and resolve it."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="create-incident" loading={isSubmitting}>Create incident</Button></>}
    >
      <form id="create-incident" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {errors.root?.message && <p role="alert" className="rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical">{errors.root.message}</p>}
        <FormField label="Title" error={errors.title?.message}>{(p) => <Input {...p} placeholder="e.g. Packet loss on rack B02 uplink" {...register('title')} />}</FormField>
        <FormField label="Description" error={errors.description?.message}>{(p) => <Textarea {...p} rows={3} placeholder="What is happening and what is affected?" {...register('description')} />}</FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Severity" error={errors.severity?.message}>
            {(p) => <Select {...p} {...register('severity')}><option value="critical">Critical</option><option value="major">Major</option><option value="minor">Minor</option></Select>}
          </FormField>
          <FormField label="Category" error={errors.category?.message}>
            {(p) => <Select {...p} {...register('category')}>{Object.entries(categoryLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}
          </FormField>
          {noRacks ? (
            <input type="hidden" value="unassigned" {...register('rackId')} />
          ) : (
            <FormField label="Affected rack" error={errors.rackId?.message}>
              {(p) => (
                <Select {...p} {...register('rackId', { onChange: () => setValue('serverIds', []) })}>
                  <option value="">Select rack</option>
                  {workspace!.racks.map((r) => <option key={r.id} value={r.id}>Rack {r.label} · {workspace!.dataCenters.find((d) => d.id === r.dcId)?.name}</option>)}
                </Select>
              )}
            </FormField>
          )}
          <FormField label="Assign to" optional>
            {(p) => <Select {...p} {...register('assigneeId')}><option value="">Unassigned</option>{workspace?.members.filter((m) => m.role !== 'viewer').map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</Select>}
          </FormField>
        </div>
        {servers.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">Affected servers <span className="font-normal text-ink-faint">(optional)</span></legend>
            <div className="flex flex-wrap gap-2">
              {servers.map((s) => {
                const on = serverIds.includes(s.id);
                return (
                  <button type="button" key={s.id} aria-pressed={on} onClick={() => setValue('serverIds', on ? serverIds.filter((x) => x !== s.id) : [...serverIds, s.id])}
                    className={`rounded-md border px-2.5 py-1 font-mono text-xs ${on ? 'border-brand bg-brand-50 text-brand-800' : 'border-line text-ink-muted hover:border-line-strong'}`}>
                    {s.hostname}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {noRacks && <p className="text-xs text-ink-muted">No infrastructure is connected yet, so this incident won't be linked to a rack.</p>}
      </form>
    </Dialog>
  );
}
