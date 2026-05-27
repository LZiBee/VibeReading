import {
  noteFontFamilyOptions,
  noteFontSizeOptions,
  noteHighlightOptions
} from '@thesis-agent/notes'
import type {
  PersistedAiSettingsState,
  PersistedMineruSettingsState,
  PersistedPdfEditorSettingsState,
  PersistedPptGenerationSettingsState,
  PersistedReasoningEffort,
  PersistedTranslationSettingsState
} from '../../../preload/thesis-agent'
import type { ReactElement } from 'react'

export type AppSettingsSection = 'ai-panel' | 'translation' | 'ppt' | 'mineru' | 'pdf-editor'

type ReasoningOption = {
  value: PersistedReasoningEffort
  label: string
}

const settingsSections: Array<{
  id: AppSettingsSection
  icon: string
  title: string
  subtitle: string
}> = [
  { id: 'ai-panel', icon: 'codicon-sparkle', title: 'AI 栏', subtitle: '主对话与默认共享 Key' },
  { id: 'translation', icon: 'codicon-globe', title: '翻译 AI', subtitle: '选区与全文翻译' },
  { id: 'ppt', icon: 'codicon-file-media', title: 'PPT AI', subtitle: '演示文稿生成' },
  { id: 'mineru', icon: 'codicon-symbol-structure', title: 'MinerU', subtitle: '论文解析与笔记样式' },
  { id: 'pdf-editor', icon: 'codicon-file-pdf', title: 'PDF 编辑器', subtitle: '默认工具与阅读方式' }
]

export function AppSettingsDialog({
  section,
  aiSettings,
  translationSettings,
  pptAiSettings,
  pptGenerationSettings,
  mineruSettings,
  pdfEditorSettings,
  modelOptions,
  reasoningOptions,
  onSectionChange,
  onClose,
  onAiSettingsChange,
  onTranslationSettingsChange,
  onTranslationAiSettingsChange,
  onPptAiSettingsChange,
  onPptGenerationSettingsChange,
  onMineruSettingsChange,
  onPdfEditorSettingsChange
}: {
  section: AppSettingsSection
  aiSettings: PersistedAiSettingsState
  translationSettings: PersistedTranslationSettingsState
  pptAiSettings: PersistedAiSettingsState
  pptGenerationSettings: PersistedPptGenerationSettingsState
  mineruSettings: PersistedMineruSettingsState
  pdfEditorSettings: PersistedPdfEditorSettingsState
  modelOptions: string[]
  reasoningOptions: ReasoningOption[]
  onSectionChange: (section: AppSettingsSection) => void
  onClose: () => void
  onAiSettingsChange: (patch: Partial<PersistedAiSettingsState>) => void
  onTranslationSettingsChange: (patch: Partial<PersistedTranslationSettingsState>) => void
  onTranslationAiSettingsChange: (patch: Partial<PersistedAiSettingsState>) => void
  onPptAiSettingsChange: (patch: Partial<PersistedAiSettingsState>) => void
  onPptGenerationSettingsChange: (patch: Partial<PersistedPptGenerationSettingsState>) => void
  onMineruSettingsChange: (patch: Partial<PersistedMineruSettingsState>) => void
  onPdfEditorSettingsChange: (patch: Partial<PersistedPdfEditorSettingsState>) => void
}): ReactElement {
  return (
    <div className="modal-backdrop settings-backdrop" role="presentation">
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
      >
        <header className="settings-header">
          <div>
            <span className="settings-eyebrow">Workbench Settings</span>
            <h2 id="app-settings-title">设置</h2>
          </div>
          <button className="icon-button" type="button" title="关闭设置" aria-label="关闭设置" onClick={onClose}>
            <span className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="设置分区">
            {settingsSections.map((item) => (
              <button
                key={item.id}
                className={item.id === section ? 'settings-nav-button active' : 'settings-nav-button'}
                type="button"
                aria-current={item.id === section ? 'page' : undefined}
                onClick={() => onSectionChange(item.id)}
              >
                <span className={`codicon ${item.icon}`} aria-hidden="true" />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {section === 'ai-panel' ? (
              <SettingsSection
                title="AI 栏配置"
                description="AI 栏会使用这里的模型、思考强度和系统提示词；这里的 API Key 也是翻译和 PPT 未单独填写 Key 时的默认共享 Key。"
              >
                <AiSettingsFields
                  settings={aiSettings}
                  modelOptions={modelOptions}
                  reasoningOptions={reasoningOptions}
                  modelListId="settings-ai-panel-models"
                  onChange={onAiSettingsChange}
                  includeSystemPrompt
                  apiKeyLabel="默认共享 API Key"
                  apiKeyPlaceholder="填写后可被翻译/PPT 在空 Key 时复用"
                  apiKeyHelp="MinerU 不使用这个 Key，它始终走自己的 MinerU API Key。"
                />
              </SettingsSection>
            ) : null}

            {section === 'translation' ? (
              <SettingsSection
                title="翻译 AI 配置"
                description="PDF 选区释义和 MinerU 全文逐段翻译都会使用这里的独立模型；API Key 留空时自动使用 AI 栏默认共享 Key。"
              >
                <div className="settings-form-grid compact">
                  <label className="settings-field">
                    <span>目标语言</span>
                    <input
                      value={translationSettings.targetLanguage}
                      placeholder="zh-CN"
                      spellCheck={false}
                      onChange={(event) => onTranslationSettingsChange({ targetLanguage: event.target.value })}
                    />
                  </label>
                  <label className="settings-check-row">
                    <input
                      type="checkbox"
                      checked={translationSettings.dictionaryEnabled}
                      onChange={(event) => onTranslationSettingsChange({ dictionaryEnabled: event.target.checked })}
                    />
                    <span>优先使用本地学术词典</span>
                  </label>
                  <label className="settings-field">
                    <span>全文翻译批量：{translationSettings.fullTextBatchSize} 个 MinerU block/次</span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={translationSettings.fullTextBatchSize}
                      onChange={(event) => onTranslationSettingsChange({ fullTextBatchSize: Number(event.target.value) })}
                    />
                    <small>默认每批 5 个 block；调大可减少请求次数，调小更稳。</small>
                  </label>
                </div>
                <AiSettingsFields
                  settings={translationSettings.ai}
                  modelOptions={modelOptions}
                  reasoningOptions={reasoningOptions}
                  modelListId="settings-translation-models"
                  onChange={onTranslationAiSettingsChange}
                  apiKeyPlaceholder="留空则使用 AI 栏默认共享 API Key"
                  apiKeyHelp="只在你想让翻译使用另一把 Key 时填写；模型和思考强度仍然独立。"
                />
              </SettingsSection>
            ) : null}

            {section === 'ppt' ? (
              <SettingsSection
                title="PPT AI 配置"
                description="PPT 生成不再跟随 AI 栏模型，可单独使用更适合结构化输出的模型；API Key 留空时自动使用 AI 栏默认共享 Key。"
              >
                <AiSettingsFields
                  settings={pptAiSettings}
                  modelOptions={modelOptions}
                  reasoningOptions={reasoningOptions}
                  modelListId="settings-ppt-models"
                  onChange={onPptAiSettingsChange}
                  apiKeyPlaceholder="留空则使用 AI 栏默认共享 API Key"
                  apiKeyHelp="只在你想让 PPT 生成使用另一把 Key 时填写；Base URL 和模型仍以本区配置为准。"
                />
                <div className="settings-card">
                  <label className="settings-field">
                    <span>默认目标页数：{pptGenerationSettings.targetSlideCount} 页</span>
                    <input
                      type="range"
                      min={8}
                      max={12}
                      step={1}
                      value={pptGenerationSettings.targetSlideCount}
                      onChange={(event) => onPptGenerationSettingsChange({ targetSlideCount: Number(event.target.value) })}
                    />
                  </label>
                  <div className="settings-inline-grid">
                    <BooleanSetting
                      label="包含目录页"
                      checked={pptGenerationSettings.includeAgenda}
                      onChange={(checked) => onPptGenerationSettingsChange({ includeAgenda: checked })}
                    />
                    <BooleanSetting
                      label="包含参考文献页"
                      checked={pptGenerationSettings.includeReferences}
                      onChange={(checked) => onPptGenerationSettingsChange({ includeReferences: checked })}
                    />
                    <BooleanSetting
                      label="包含附录页"
                      checked={pptGenerationSettings.includeAppendix}
                      onChange={(checked) => onPptGenerationSettingsChange({ includeAppendix: checked })}
                    />
                    <BooleanSetting
                      label="纳入关联笔记"
                      checked={pptGenerationSettings.includeNotes}
                      onChange={(checked) => onPptGenerationSettingsChange({ includeNotes: checked })}
                    />
                    <BooleanSetting
                      label="纳入 AI 回答"
                      checked={pptGenerationSettings.includeAiAnswers}
                      onChange={(checked) => onPptGenerationSettingsChange({ includeAiAnswers: checked })}
                    />
                  </div>
                </div>
              </SettingsSection>
            ) : null}

            {section === 'mineru' ? (
              <SettingsSection
                title="MinerU 解析配置"
                description="MinerU 使用独立 API Key，不会共用 AI 栏默认 Key；这里的解析选项与 PDF 工具栏中的 MinerU 设置保持同步。"
              >
                <div className="settings-form-grid">
                  <label className="settings-field wide">
                    <span>MinerU API Key</span>
                    <input
                      type="password"
                      value={mineruSettings.apiKey}
                      placeholder="填写 MinerU API Key（独立）"
                      spellCheck={false}
                      onChange={(event) => onMineruSettingsChange({ apiKey: event.target.value })}
                    />
                    <small>不会从 AI 栏共享 Key，也不会被翻译或 PPT 复用。</small>
                  </label>
                  <label className="settings-field">
                    <span>解析方式</span>
                    <select
                      value={mineruSettings.modelVersion}
                      onChange={(event) =>
                        onMineruSettingsChange({
                          modelVersion: event.target.value as PersistedMineruSettingsState['modelVersion']
                        })
                      }
                    >
                      <option value="vlm">vlm</option>
                      <option value="pipeline">pipeline</option>
                      <option value="MinerU-HTML">MinerU-HTML</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>文档语言</span>
                    <input
                      value={mineruSettings.language}
                      spellCheck={false}
                      onChange={(event) => onMineruSettingsChange({ language: event.target.value })}
                    />
                  </label>
                  <label className="settings-field">
                    <span>页码范围</span>
                    <input
                      value={mineruSettings.pageRange}
                      placeholder="例如 1-10"
                      spellCheck={false}
                      onChange={(event) => onMineruSettingsChange({ pageRange: event.target.value })}
                    />
                  </label>
                  <label className="settings-field wide">
                    <span>公开 URL（可选）</span>
                    <input
                      value={mineruSettings.sourceUrl}
                      placeholder="仅在需要绕过本地上传时使用"
                      spellCheck={false}
                      onChange={(event) => onMineruSettingsChange({ sourceUrl: event.target.value })}
                    />
                  </label>
                </div>
                <div className="settings-inline-grid">
                  <BooleanSetting
                    label="启用表格解析"
                    checked={mineruSettings.enableTable}
                    onChange={(checked) => onMineruSettingsChange({ enableTable: checked })}
                  />
                  <BooleanSetting
                    label="启用公式解析"
                    checked={mineruSettings.enableFormula}
                    onChange={(checked) => onMineruSettingsChange({ enableFormula: checked })}
                  />
                  <BooleanSetting
                    label="OCR 模式"
                    checked={mineruSettings.isOcr}
                    onChange={(checked) => onMineruSettingsChange({ isOcr: checked })}
                  />
                  <BooleanSetting
                    label="自动清洗非正文内容"
                    checked={mineruSettings.autoClean}
                    onChange={(checked) => onMineruSettingsChange({ autoClean: checked })}
                  />
                </div>
                <div className="settings-card">
                  <div className="settings-form-grid">
                    <label className="settings-field">
                      <span>笔记字体</span>
                      <select
                        value={mineruSettings.noteStyle.fontFamily}
                        onChange={(event) =>
                          onMineruSettingsChange({
                            noteStyle: {
                              ...mineruSettings.noteStyle,
                              fontFamily: event.target.value
                            }
                          })
                        }
                      >
                        {noteFontFamilyOptions.map((option) => (
                          <option key={option.label} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="settings-field">
                      <span>笔记字号</span>
                      <select
                        value={String(mineruSettings.noteStyle.fontSize)}
                        onChange={(event) =>
                          onMineruSettingsChange({
                            noteStyle: {
                              ...mineruSettings.noteStyle,
                              fontSize: Number(event.target.value)
                            }
                          })
                        }
                      >
                        {noteFontSizeOptions.map((fontSize) => (
                          <option key={fontSize} value={fontSize}>
                            {fontSize}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="settings-field">
                      <span>背景颜色</span>
                      <select
                        value={mineruSettings.noteStyle.highlight}
                        onChange={(event) =>
                          onMineruSettingsChange({
                            noteStyle: {
                              ...mineruSettings.noteStyle,
                              highlight: event.target.value
                            }
                          })
                        }
                      >
                        {noteHighlightOptions.map((option) => (
                          <option key={option.label} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="settings-inline-grid">
                    <BooleanSetting
                      label="加粗"
                      checked={mineruSettings.noteStyle.bold}
                      onChange={(checked) =>
                        onMineruSettingsChange({
                          noteStyle: {
                            ...mineruSettings.noteStyle,
                            bold: checked
                          }
                        })
                      }
                    />
                    <BooleanSetting
                      label="倾斜"
                      checked={mineruSettings.noteStyle.italic}
                      onChange={(checked) =>
                        onMineruSettingsChange({
                          noteStyle: {
                            ...mineruSettings.noteStyle,
                            italic: checked
                          }
                        })
                      }
                    />
                  </div>
                </div>
              </SettingsSection>
            ) : null}

            {section === 'pdf-editor' ? (
              <SettingsSection title="PDF 编辑器配置" description="这些选项会作为新打开 PDF 的默认阅读与编辑行为。">
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>默认工具</span>
                    <select
                      value={pdfEditorSettings.defaultTool}
                      onChange={(event) =>
                        onPdfEditorSettingsChange({
                          defaultTool: event.target.value === 'highlight' ? 'highlight' : 'select'
                        })
                      }
                    >
                      <option value="select">选择文字</option>
                      <option value="highlight">标注高亮</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>阅读方式</span>
                    <select
                      value={pdfEditorSettings.defaultBrowseMode}
                      onChange={(event) =>
                        onPdfEditorSettingsChange({
                          defaultBrowseMode: event.target.value === 'scroll' ? 'scroll' : 'page'
                        })
                      }
                    >
                      <option value="page">单页</option>
                      <option value="scroll">连续</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>渲染模式</span>
                    <select
                      value={pdfEditorSettings.defaultRenderMode}
                      onChange={(event) =>
                        onPdfEditorSettingsChange({
                          defaultRenderMode: event.target.value === 'pdfjs' ? 'pdfjs' : 'compatibility'
                        })
                      }
                    >
                      <option value="compatibility">兼容模式</option>
                      <option value="pdfjs">PDF.js 原生</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>默认缩放：{Math.round(pdfEditorSettings.defaultScale * 100)}%</span>
                    <input
                      type="range"
                      min={0.5}
                      max={3}
                      step={0.25}
                      value={pdfEditorSettings.defaultScale}
                      onChange={(event) => onPdfEditorSettingsChange({ defaultScale: Number(event.target.value) })}
                    />
                  </label>
                </div>
                <BooleanSetting
                  label="选中文字后显示操作浮层"
                  checked={pdfEditorSettings.showSelectionPopover}
                  onChange={(checked) => onPdfEditorSettingsChange({ showSelectionPopover: checked })}
                />
              </SettingsSection>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: ReactElement | ReactElement[]
}): ReactElement {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  )
}

function AiSettingsFields({
  settings,
  modelOptions,
  reasoningOptions,
  modelListId,
  includeSystemPrompt = false,
  apiKeyLabel = 'API Key',
  apiKeyPlaceholder = '保存在本地 userData',
  apiKeyHelp,
  onChange
}: {
  settings: PersistedAiSettingsState
  modelOptions: string[]
  reasoningOptions: ReasoningOption[]
  modelListId: string
  includeSystemPrompt?: boolean
  apiKeyLabel?: string
  apiKeyPlaceholder?: string
  apiKeyHelp?: string
  onChange: (patch: Partial<PersistedAiSettingsState>) => void
}): ReactElement {
  const modelChoices = modelOptions.includes(settings.model) ? modelOptions : [settings.model, ...modelOptions].filter(Boolean)

  return (
    <div className="settings-card">
      <div className="settings-form-grid">
        <label className="settings-field">
          <span>Provider</span>
          <input value={settings.providerId} spellCheck={false} onChange={(event) => onChange({ providerId: event.target.value })} />
        </label>
        <label className="settings-field wide">
          <span>Base URL</span>
          <input value={settings.baseUrl} spellCheck={false} onChange={(event) => onChange({ baseUrl: event.target.value })} />
        </label>
        <label className="settings-field">
          <span>模型名称</span>
          <input
            value={settings.model}
            list={modelListId}
            spellCheck={false}
            onChange={(event) => onChange({ model: event.target.value })}
          />
          <datalist id={modelListId}>
            {modelChoices.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>
        <label className="settings-field">
          <span>思考强度</span>
          <select
            value={settings.reasoningEffort}
            onChange={(event) => onChange({ reasoningEffort: event.target.value as PersistedReasoningEffort })}
          >
            {reasoningOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field wide">
          <span>{apiKeyLabel}</span>
          <input
            type="password"
            value={settings.apiKey}
            placeholder={apiKeyPlaceholder}
            spellCheck={false}
            onChange={(event) => onChange({ apiKey: event.target.value })}
          />
          {apiKeyHelp ? <small>{apiKeyHelp}</small> : null}
        </label>
        {includeSystemPrompt ? (
          <label className="settings-field wide">
            <span>系统提示词</span>
            <textarea
              value={settings.systemPrompt}
              rows={4}
              spellCheck={false}
              onChange={(event) => onChange({ systemPrompt: event.target.value })}
            />
          </label>
        ) : null}
      </div>
      <div className="settings-inline-grid">
        <BooleanSetting
          label="不保存 Responses 结果"
          checked={settings.disableResponseStorage}
          onChange={(checked) => onChange({ disableResponseStorage: checked })}
        />
        <BooleanSetting
          label="使用 Bearer Auth"
          checked={settings.requiresOpenAiAuth}
          onChange={(checked) => onChange({ requiresOpenAiAuth: checked })}
        />
      </div>
    </div>
  )
}

function BooleanSetting({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): ReactElement {
  return (
    <label className="settings-check-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
