export type IndependentCrmLoadOptions<TStatuses, TContacts> = {
  loadStatuses: () => Promise<TStatuses>;
  loadContacts: () => Promise<TContacts>;
  onStatuses: (value: TStatuses) => void;
  onContacts: (value: TContacts) => void;
  onStatusesError: (error: unknown) => void;
  onContactsError: (error: unknown) => void;
  onContactsSettled: () => void;
};

export function startIndependentCrmLoad<TStatuses, TContacts>(
  options: IndependentCrmLoadOptions<TStatuses, TContacts>
) {
  let active = true;

  void options.loadStatuses().then(
    (value) => {
      if (active) options.onStatuses(value);
    },
    (error) => {
      if (active) options.onStatusesError(error);
    }
  );

  void options.loadContacts().then(
    (value) => {
      if (!active) return;
      if (value === null || value === undefined) {
        options.onContactsError(new Error("crm_contacts_response_missing"));
        return;
      }
      options.onContacts(value);
    },
    (error) => {
      if (active) options.onContactsError(error);
    }
  ).finally(() => {
    if (active) options.onContactsSettled();
  });

  return () => {
    active = false;
  };
}

export function createLatestResponseGuard() {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    isCurrent(requestId: number) {
      return requestId === latest;
    },
    invalidate() {
      latest += 1;
    },
  };
}
