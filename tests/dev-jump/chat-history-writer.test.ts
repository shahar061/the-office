import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { writeChatHistoryFiles } from '../../dev-jump/engine/chat-history-writer';

describe('writeChatHistoryFiles', () => {
  let tmpProject: string;
  let tmpFixtures: string;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-jump-chat-project-'));
    tmpFixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-jump-chat-fixtures-'));
  });

  afterEach(() => {
    fs.rmSync(tmpProject, { recursive: true, force: true });
    fs.rmSync(tmpFixtures, { recursive: true, force: true });
  });

  it('copies specified fixture files into .the-office/chat-history/', () => {
    fs.writeFileSync(
      path.join(tmpFixtures, 'imagine_ceo_1.json'),
      JSON.stringify([{ id: 'm1', role: 'user', text: 'hi', timestamp: 1 }]),
    );
    fs.writeFileSync(
      path.join(tmpFixtures, 'imagine_product-manager_1.json'),
      JSON.stringify([{ id: 'm2', role: 'agent', agentRole: 'product-manager', text: 'hello', timestamp: 2 }]),
    );

    writeChatHistoryFiles(tmpProject, tmpFixtures, [
      'imagine_ceo_1.json',
      'imagine_product-manager_1.json',
    ]);

    const ceo = JSON.parse(
      fs.readFileSync(path.join(tmpProject, '.the-office/chat-history/imagine_ceo_1.json'), 'utf-8'),
    );
    expect(ceo).toHaveLength(1);
    expect(ceo[0].text).toBe('hi');

    const pm = JSON.parse(
      fs.readFileSync(path.join(tmpProject, '.the-office/chat-history/imagine_product-manager_1.json'), 'utf-8'),
    );
    expect(pm).toHaveLength(1);
    expect(pm[0].agentRole).toBe('product-manager');
  });

  it('creates the chat-history directory if missing', () => {
    fs.writeFileSync(path.join(tmpFixtures, 'imagine_ceo_1.json'), '[]');
    writeChatHistoryFiles(tmpProject, tmpFixtures, ['imagine_ceo_1.json']);
    expect(fs.existsSync(path.join(tmpProject, '.the-office/chat-history'))).toBe(true);
  });

  it('throws if a referenced fixture is missing', () => {
    expect(() =>
      writeChatHistoryFiles(tmpProject, tmpFixtures, ['imagine_nonexistent_1.json']),
    ).toThrow(/imagine_nonexistent_1\.json/);
  });
});
