import { useMemo } from 'react';
import type { ProjectMeta } from '../../shared/types';
import { api } from '../api';
import { useDialogs } from '../ui/dialogs';

/** 资源管理器「复制为路径」会给路径套上引号 */
function stripQuotes(value: string): string {
  return value.replace(/^"(.*)"$/, '$1');
}

/**
 * 项目的增删改与重新扫描。用对话框收集输入、用 toast 反馈结果，失败一律提示错误而不是静默。
 * 全部是普通 async 函数，调用方不需要处理异常。
 */
export function useProjectMutations() {
  const { prompt, confirm, toast } = useDialogs();
  return useMemo(() => {
    const fail = (err: unknown) => toast({ kind: 'error', message: (err as Error).message });
    return {
      async add(): Promise<void> {
        const added: { project?: ProjectMeta } = {};
        const path = await prompt({
          title: '添加项目',
          description: '输入项目的绝对路径（目录下需有 .agents/notes）。',
          label: '项目路径',
          placeholder: 'D:\\Work\\my-project',
          confirmLabel: '添加',
          onSubmit: async (value) => {
            added.project = await api.addProject(stripQuotes(value));
          },
        });
        if (path !== null && added.project) toast({ kind: 'success', message: `已添加「${added.project.displayName}」` });
      },

      async rename(project: ProjectMeta): Promise<void> {
        await prompt({
          title: '重命名项目',
          description: '留空则恢复为文件夹名。',
          label: '显示名',
          initialValue: project.displayName,
          allowEmpty: true,
          confirmLabel: '保存',
          onSubmit: (name) => api.patchProject(project.id, { name: name || null }),
        });
      },

      async toggleHidden(project: ProjectMeta): Promise<void> {
        try {
          await api.patchProject(project.id, { hidden: !project.hidden });
          toast({
            message: project.hidden ? `已取消隐藏「${project.displayName}」` : `已隐藏「${project.displayName}」`,
            action: { label: '撤销', onClick: () => void api.patchProject(project.id, { hidden: project.hidden }).catch(fail) },
          });
        } catch (err) {
          fail(err);
        }
      },

      async remove(project: ProjectMeta): Promise<void> {
        const ok = await confirm({
          title: '移除项目',
          description: `从列表中移除「${project.displayName}」？不会删除磁盘上的任何文件。`,
          tone: 'danger',
          confirmLabel: '移除',
        });
        if (!ok) return;
        try {
          await api.removeProject(project.id);
          toast({ message: `已移除「${project.displayName}」` });
        } catch (err) {
          fail(err);
        }
      },

      async rescan(projectId: string): Promise<void> {
        try {
          const meta = await api.rescan(projectId);
          toast({ kind: 'success', message: `已重新扫描「${meta.displayName}」` });
        } catch (err) {
          fail(err);
        }
      },
    };
  }, [prompt, confirm, toast]);
}
