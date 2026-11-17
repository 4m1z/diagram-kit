// Spec in, positioned model out. The model is the contract every renderer reads.
import { layoutGraph } from './layout-graph.mjs';
import { layoutSequence } from './layout-sequence.mjs';
import { layoutMindmap } from './layout-mindmap.mjs';
import { relative } from 'node:path';
import { collectIcons, finalize, parseBrief, placeBadges } from './model.mjs';

export const MODEL_VERSION = 1;

export async function buildModel(spec, { options } = {}) {
  const warnings = [...spec.warnings];
  let laid;
  if (spec.engine === 'sequence') laid = layoutSequence(spec);
  else if (spec.engine === 'mindmap') laid = await layoutMindmap(spec);
  else laid = await layoutGraph(spec, { options });

  const brief = parseBrief(spec.brief);
  if (spec.brief && !brief) warnings.push({ level: 'warn', code: 'brief', message: `Brief not found: ${spec.brief}.`, hint: 'Fix the brief path or remove it.' });

  const model = {
    version: MODEL_VERSION,
    kind: spec.kind,
    engine: spec.engine,
    title: spec.title,
    subtitle: spec.subtitle,
    direction: spec.direction ?? null,
    numbered: spec.numbered ?? true,
    theme: spec.theme,
    nodes: laid.nodes,
    groups: laid.groups ?? [],
    edges: laid.edges,
    lines: laid.lines ?? [],
    bars: laid.bars ?? [],
    flows: laid.flows ?? spec.flows ?? [],
    brief: brief ? { status: brief.status, file: relative(spec.dir, spec.brief) } : null,
    facts: brief?.facts ?? {},
    draft: Boolean(brief && brief.status !== 'approved'),
    requireSources: spec.requireSources,
  };
  collectIcons(model, warnings);
  if (spec.engine !== 'sequence') placeBadges(model);
  finalize(model);
  return { model, warnings, elkInput: laid.elkInput };
}
