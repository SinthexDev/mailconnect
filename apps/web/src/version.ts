import changelogDe from '../../../_documentation/CHANGELOG.md?raw';
import { parseChangelog } from './changelog';

export const appVersion = parseChangelog(changelogDe)[0]?.version ?? '';
