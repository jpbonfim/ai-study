import { useCallback, useEffect, useState } from 'react';
import { readItem, removeItem, STORAGE_KEYS, writeItem } from '../../preferences/storage';

/** Active tag and "Tags de outros" switch of a subject, persisted like before. */
export interface StudyState {
  tag: string | null;
  selectTag(tag: string | null, updateUrl?: boolean): void;
  showOtherTags: boolean;
  toggleOtherTags(): void;
}

/** Updates a query parameter without a navigation (the router's history state is preserved). */
export function replaceQueryParam(name: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(window.history.state, '', url.toString());
}

/**
 * @param defaultTag tag implied by the page (e.g. the tag of the open question).
 * @param otherTagsToggleAvailable whether the page offers the "Tags de outros" switch.
 */
export function useStudyState(materiaSlug: string, defaultTag: string | null, otherTagsToggleAvailable: boolean): StudyState {
  const [tag, setTag] = useState<string | null>(() => {
    const urlTag = new URLSearchParams(window.location.search).get('tag');
    return urlTag || defaultTag || readItem(STORAGE_KEYS.selectedTag(materiaSlug)) || null;
  });

  const [showOtherTags, setShowOtherTags] = useState(() => {
    const urlTag = new URLSearchParams(window.location.search).get('tag') || defaultTag;
    const show = readItem(STORAGE_KEYS.showOtherTags) === 'true' || Boolean(urlTag?.startsWith('user_'));
    if (otherTagsToggleAvailable) writeItem(STORAGE_KEYS.showOtherTags, show ? 'true' : 'false');
    return show;
  });

  // The tag a page opens with becomes the subject's remembered tag.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the opening tag is persisted.
  useEffect(() => {
    if (tag) writeItem(STORAGE_KEYS.selectedTag(materiaSlug), tag);
  }, []);

  const selectTag = useCallback(
    (next: string | null, updateUrl = true) => {
      setTag(next);
      if (next) writeItem(STORAGE_KEYS.selectedTag(materiaSlug), next);
      else removeItem(STORAGE_KEYS.selectedTag(materiaSlug));
      if (updateUrl) replaceQueryParam('tag', next);
    },
    [materiaSlug],
  );

  const toggleOtherTags = useCallback(() => {
    setShowOtherTags((current) => {
      writeItem(STORAGE_KEYS.showOtherTags, current ? 'false' : 'true');
      return !current;
    });
  }, []);

  return { tag, selectTag, showOtherTags, toggleOtherTags };
}
