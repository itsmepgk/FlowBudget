const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let currentUser = null;
let currentGroup = null;
let groupMembers = []; // { user_uuid, user_email, name }

const CATEGORIES = {
  food: '🍔', transport: '🚗', accommodation: '🏠',
  entertainment: '🎉', shopping: '🛍️', other: '🧾'
};
const CURRENCIES = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', AUD: 'A$', CAD: 'C$' };
function sym() { return CURRENCIES[currentGroup?.currency] || '$'; }

// ─── Auth ─────────────────────────────────────────────────────────────────────

function displayName(name, email) {
  if (!name || name.includes('@')) return (email || '').split('@')[0] || 'User';
  return name;
}

function setAuthTab(tab) {
  const isSignup = tab === 'signup';
  document.getElementById('signupOnlyFields').style.display  = isSignup ? 'block' : 'none';
  document.getElementById('authActionBtn').textContent        = isSignup ? 'Sign Up' : 'Login';
  document.getElementById('authActionBtn').onclick            = isSignup ? signup : login;
  document.getElementById('password').autocomplete           = isSignup ? 'new-password' : 'current-password';
  document.getElementById('tabLogin').classList.toggle('active',  !isSignup);
  document.getElementById('tabSignup').classList.toggle('active',  isSignup);
  document.getElementById('authStatus').textContent          = '';
}

function toggleUserMenu() {
  const m = document.getElementById('userMenu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function closeUserMenu() {
  document.getElementById('userMenu').style.display = 'none';
}

function toggleAuthPanel() {
  const modal = document.getElementById('authModal');
  modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
  if (modal.style.display === 'flex') {
    setAuthTab('login');
    document.getElementById('email').focus();
  }
}

async function signup() {
  const emailVal = document.getElementById('email').value.trim();
  const nameVal  = document.getElementById('name').value.trim();
  const passVal  = document.getElementById('password').value;
  const status   = document.getElementById('authStatus');

  if (!nameVal)  { status.textContent = 'Please enter your name';  return; }
  if (!emailVal) { status.textContent = 'Please enter your email'; return; }
  if (nameVal.includes('@'))  { status.textContent = 'Please use your real name, not an email address'; return; }
  if (nameVal.length > 30)    { status.textContent = 'Name must be 30 characters or less'; return; }

  const { error, data } = await sb.auth.signUp({ email: emailVal, password: passVal });
  if (error) { status.textContent = error.message; return; }

  if (data.user) {
    await sb.from('users').upsert([{ id: data.user.id, name: nameVal }]);
  }
  status.style.color = '#34d399';
  status.textContent = 'Signup successful! Check your email to confirm, then log in.';
}

async function login() {
  const emailVal = document.getElementById('email').value.trim();
  const passVal  = document.getElementById('password').value;
  const status   = document.getElementById('authStatus');

  const { error } = await sb.auth.signInWithPassword({ email: emailVal, password: passVal });
  if (error) { status.textContent = error.message; return; }

  document.getElementById('authModal').style.display = 'none';
  await init();
}

async function logout() {
  await sb.auth.signOut();
  location.reload();
}

function promptNameChange() {
  const newName = prompt('Enter your new display name (max 30 characters).\nWarning: this can only be done once.');
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed)               { alert('Name cannot be empty'); return; }
  if (trimmed.length > 30)    { alert('Name must be 30 characters or less'); return; }
  if (trimmed.includes('@'))  { alert('Please use your real name, not an email address'); return; }
  if (!confirm(`Change your name to "${trimmed}"?\n\nThis cannot be changed again.`)) return;
  changeName(trimmed);
}

async function changeName(name) {
  const { error } = await sb.from('users').update({ name, name_changed: true }).eq('id', currentUser.id);
  if (error) { alert(error.message); return; }
  currentUser.name = name;
  currentUser.nameChanged = true;
  // Keep groupMembers in sync so expense modals immediately reflect new name
  const selfIdx = groupMembers.findIndex(m => m.user_uuid === currentUser.id);
  if (selfIdx >= 0) groupMembers[selfIdx].name = name;
  document.getElementById('userAvatarBtn').textContent     = name[0].toUpperCase();
  document.getElementById('userMenuName').textContent      = name;
  document.getElementById('editNameMenuBtn').style.display = 'none';
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const { data: { user } } = await sb.auth.getUser();
  currentUser = user;

  const authBtn         = document.getElementById('authBtn');
  const userInfoEl      = document.getElementById('userInfo');
  const loggedInSection = document.getElementById('loggedInSection');
  const guestBanner     = document.getElementById('guestBanner');

  if (user) {
    const { data } = await sb.from('users').select('name, name_changed').eq('id', user.id).single();
    currentUser.name = displayName(data?.name, user.email);
    currentUser.nameChanged = data?.name_changed || false;
    authBtn.style.display = 'none';
    userInfoEl.style.display = 'block';
    document.getElementById('userAvatarBtn').textContent     = (currentUser.name || '?')[0].toUpperCase();
    document.getElementById('userMenuName').textContent      = currentUser.name;
    document.getElementById('userMenuEmail').textContent     = user.email;
    document.getElementById('editNameMenuBtn').style.display = currentUser.nameChanged ? 'none' : 'block';
    loggedInSection.style.display = 'block';
    guestBanner.style.display = 'none';
    await loadGroups();
  } else {
    authBtn.style.display = 'block';
    userInfoEl.style.display = 'none';
    loggedInSection.style.display = 'none';
    guestBanner.style.display = 'block';
  }
}

// ─── Groups ───────────────────────────────────────────────────────────────────

function makeCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function loadGroupNetBalances(groupIds) {
  const [{ data: exps }, { data: sett }] = await Promise.all([
    sb.from('expenses').select('id, group_id, paid_by, amount').in('group_id', groupIds),
    sb.from('settlements').select('group_id, payer_uuid, receiver_uuid, amount').in('group_id', groupIds)
  ]);
  const nets = Object.fromEntries(groupIds.map(id => [id, 0]));
  const expMap = {};
  (exps || []).forEach(e => {
    expMap[e.id] = e.group_id;
    if (e.paid_by === currentUser.id) nets[e.group_id] += parseFloat(e.amount);
  });
  const expIds = Object.keys(expMap);
  if (expIds.length) {
    const { data: splits } = await sb.from('expense_splits')
      .select('expense_id, amount').in('expense_id', expIds).eq('user_uuid', currentUser.id);
    (splits || []).forEach(s => { nets[expMap[s.expense_id]] -= parseFloat(s.amount); });
  }
  (sett || []).forEach(s => {
    if (s.payer_uuid === currentUser.id) nets[s.group_id] += parseFloat(s.amount);
    if (s.receiver_uuid === currentUser.id) nets[s.group_id] -= parseFloat(s.amount);
  });
  return nets;
}

async function loadGroups() {
  const { data: memberships } = await sb
    .from('group_members').select('group_id').eq('user_uuid', currentUser.id);

  const el = document.getElementById('groupsList');
  if (!memberships?.length) {
    el.innerHTML = '<p class="empty-msg">No groups yet. Create or join one above!</p>';
    return;
  }

  const ids = memberships.map(m => m.group_id);
  const [{ data: groups }, nets] = await Promise.all([
    sb.from('groups').select('*').in('id', ids),
    loadGroupNetBalances(ids)
  ]);

  el.innerHTML = groups.map(g => {
    const r = Math.round((nets[g.id] || 0) * 100) / 100;
    const csym = CURRENCIES[g.currency] || '$';
    const badge = r > 0.005
      ? `<span class="balance-badge owed">owed ${csym}${r.toFixed(2)}</span>`
      : r < -0.005
        ? `<span class="balance-badge owes">owes ${csym}${Math.abs(r).toFixed(2)}</span>`
        : `<span class="balance-badge settled">settled</span>`;
    return `
    <div class="group-item" data-id="${g.id}" data-name="${esc(g.name)}" data-code="${g.invite_code}" data-currency="${g.currency || 'USD'}" onclick="openGroup(this)">
      <div>
        <div class="group-item-name">${esc(g.name)}</div>
        <div class="group-item-code">Code: ${g.invite_code}</div>
      </div>
      <div class="group-item-right">${badge}<span class="chevron">›</span></div>
    </div>`;
  }).join('');
}

async function createGroup() {
  if (!currentUser) { alert('Login first'); return; }
  const nameVal = document.getElementById('groupName').value.trim();
  if (!nameVal) { alert('Enter a group name'); return; }

  const currency = document.getElementById('groupCurrency').value;
  const { data, error } = await sb.from('groups')
    .insert([{ name: nameVal, invite_code: makeCode(), owner_uuid: currentUser.id, currency }])
    .select();
  if (error) { alert(error.message); return; }

  await sb.from('group_members').insert([{
    group_id: data[0].id, user_uuid: currentUser.id, user_email: currentUser.email
  }]);
  document.getElementById('groupName').value = '';
  await loadGroups();
}

async function joinGroup() {
  if (!currentUser) { alert('Login first'); return; }
  const codeVal = document.getElementById('inviteCode').value.trim().toUpperCase();

  const { data: group } = await sb.from('groups').select('*').eq('invite_code', codeVal).single();
  if (!group) { alert('Invalid invite code'); return; }

  const { error } = await sb.from('group_members').insert([{
    group_id: group.id, user_uuid: currentUser.id, user_email: currentUser.email
  }]);
  if (error?.code === '23505') { alert('You are already in this group'); return; }
  if (error) { alert(error.message); return; }

  document.getElementById('inviteCode').value = '';
  await loadGroups();
}

// ─── Group Detail ─────────────────────────────────────────────────────────────

async function openGroup(el) {
  currentGroup = { id: +el.dataset.id, name: el.dataset.name, invite_code: el.dataset.code, currency: el.dataset.currency || 'USD' };
  document.getElementById('mainView').style.display = 'none';
  document.getElementById('groupDetail').style.display = 'block';
  document.getElementById('groupDetailName').textContent = el.dataset.name;
  document.getElementById('groupInviteCode').textContent = `Code: ${el.dataset.code}`;

  closeUserMenu();
  subscribeToGroup(currentGroup.id);
  await loadGroupMembers(currentGroup.id);
  await loadGroupExpenses(currentGroup.id);
  await Promise.all([loadBalances(currentGroup.id), loadActivity(currentGroup.id)]);
}

async function leaveGroup() {
  if (!confirm(`Leave "${currentGroup.name}"? You won't see this group anymore.`)) return;
  const { error } = await sb.from('group_members')
    .delete().eq('group_id', currentGroup.id).eq('user_uuid', currentUser.id);
  if (error) { alert(error.message); return; }
  goBack();
  await loadGroups();
}

let realtimeChannel  = null;
let editingExpenseId = null;
let simplifyEnabled  = true;

function subscribeToGroup(groupId) {
  unsubscribeFromGroup();
  realtimeChannel = sb.channel(`grp-${groupId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses',    filter: `group_id=eq.${groupId}` }, () => {
      loadGroupExpenses(groupId);
      Promise.all([loadBalances(groupId), loadActivity(groupId)]);
      loadGroups();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `group_id=eq.${groupId}` }, () => {
      Promise.all([loadBalances(groupId), loadActivity(groupId)]);
      loadGroups();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, () => {
      loadGroupMembers(groupId);
    })
    .subscribe();
}

function unsubscribeFromGroup() {
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
}

function goBack() {
  closeUserMenu();
  unsubscribeFromGroup();
  currentGroup = null;
  groupMembers = [];
  document.getElementById('groupDetail').style.display = 'none';
  document.getElementById('mainView').style.display = 'block';
}

function copyInviteCode() {
  navigator.clipboard.writeText(currentGroup.invite_code);
  const badge = document.getElementById('groupInviteCode');
  const orig = badge.textContent;
  badge.textContent = '✓ Copied!';
  setTimeout(() => { badge.textContent = orig; }, 1500);
}

async function loadGroupMembers(groupId) {
  const { data: members } = await sb
    .from('group_members').select('user_uuid, user_email').eq('group_id', groupId);
  if (!members) return;

  const uuids = members.map(m => m.user_uuid);
  const { data: users } = await sb.from('users').select('id, name').in('id', uuids);
  const nameMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));

  groupMembers = members.map(m => ({
    user_uuid:  m.user_uuid,
    user_email: m.user_email,
    name: m.user_uuid === currentUser?.id
      ? currentUser.name
      : displayName(nameMap[m.user_uuid], m.user_email)
  }));

  document.getElementById('membersList').innerHTML = groupMembers.map(m => `
    <div class="member-item">
      <div class="member-avatar">${m.name.charAt(0).toUpperCase()}</div>
      <div>
        <div class="member-name">${esc(m.name)}</div>
        <div class="member-email">${esc(m.user_email)}</div>
      </div>
    </div>`).join('');
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

async function logEvent(summary, eventType) {
  await sb.from('group_events').insert([{ group_id: currentGroup.id, user_uuid: currentUser.id, event_type: eventType, summary }]);
}

function populateSplitMembers() {
  document.getElementById('splitWith').innerHTML = groupMembers.map(m =>
    `<label class="split-member"><input type="checkbox" value="${m.user_uuid}" checked> ${esc(m.name)}</label>`
  ).join('');
  document.getElementById('splitCustomInputs').innerHTML = groupMembers.map(m =>
    `<label class="split-input-row"><span>${esc(m.name)}</span><input type="number" step="0.01" min="0" data-uuid="${m.user_uuid}" placeholder="0.00" oninput="updateSplitAmounts()"></label>`
  ).join('');
  document.getElementById('splitRatioInputs').innerHTML = groupMembers.map(m =>
    `<label class="split-input-row"><span>${esc(m.name)}</span><input type="number" step="0.1" min="0" data-uuid="${m.user_uuid}" value="1"></label>`
  ).join('');
}

function updateSplitUI() {
  const t = document.getElementById('splitType').value;
  document.getElementById('splitEqual').style.display  = t === 'equal'  ? 'block' : 'none';
  document.getElementById('splitCustom').style.display = t === 'custom' ? 'block' : 'none';
  document.getElementById('splitRatio').style.display  = t === 'ratio'  ? 'block' : 'none';
  updateSplitAmounts();
}

function updateSplitAmounts() {
  if (document.getElementById('splitType').value !== 'custom') return;
  const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
  const total  = [...document.querySelectorAll('#splitCustomInputs input')].reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  const rem    = amount - total;
  const el     = document.getElementById('splitCustomRemaining');
  el.textContent = Math.abs(rem) < 0.005 ? '✅ Balanced' : rem > 0 ? `${sym()}${rem.toFixed(2)} remaining` : `Over by ${sym()}${Math.abs(rem).toFixed(2)}`;
  el.className   = 'split-remaining ' + (Math.abs(rem) < 0.005 ? 'balanced' : 'unbalanced');
}

function openExpenseModal(expenseId = null) {
  if (!currentUser) { alert('Login first'); return; }
  editingExpenseId = expenseId;
  document.getElementById('expenseModalTitle').textContent   = expenseId ? 'Edit Expense'   : 'Add Expense';
  document.getElementById('expenseSubmitBtn').textContent    = expenseId ? 'Save Changes'   : 'Add Expense';
  document.getElementById('paidBy').innerHTML = groupMembers.map(m =>
    `<option value="${m.user_uuid}" ${m.user_uuid === currentUser.id ? 'selected' : ''}>${esc(m.name)}</option>`
  ).join('');
  document.getElementById('splitType').value = 'equal';
  updateSplitUI();
  if (!expenseId) {
    document.getElementById('expenseDesc').value    = '';
    document.getElementById('expenseAmount').value  = '';
    document.getElementById('expenseCategory').value = 'other';
    populateSplitMembers();
  }
  document.getElementById('expenseModal').style.display = 'flex';
}

async function openEditExpense(id) {
  const [{ data: exp }, { data: splits }] = await Promise.all([
    sb.from('expenses').select('*').eq('id', id).single(),
    sb.from('expense_splits').select('*').eq('expense_id', id)
  ]);
  openExpenseModal(id);
  document.getElementById('expenseDesc').value     = exp.description;
  document.getElementById('expenseAmount').value   = exp.amount;
  document.getElementById('expenseCategory').value = exp.category || 'other';
  document.getElementById('paidBy').value          = exp.paid_by;
  populateSplitMembers();
  if (splits?.length) {
    const splitMap  = Object.fromEntries(splits.map(s => [s.user_uuid, parseFloat(s.amount)]));
    const splitUuids = new Set(splits.map(s => s.user_uuid));
    const amounts    = splits.map(s => parseFloat(s.amount));
    const allEqual   = amounts.every(a => Math.abs(a - amounts[0]) < 0.01);
    if (allEqual) {
      document.querySelectorAll('#splitWith input').forEach(cb => { cb.checked = splitUuids.has(cb.value); });
    } else {
      document.getElementById('splitType').value = 'custom';
      updateSplitUI();
      document.querySelectorAll('#splitCustomInputs input').forEach(inp => {
        if (splitMap[inp.dataset.uuid]) inp.value = splitMap[inp.dataset.uuid].toFixed(2);
      });
      updateSplitAmounts();
    }
  }
}

function closeExpenseModal() {
  document.getElementById('expenseModal').style.display = 'none';
  editingExpenseId = null;
}

async function submitExpense() {
  const desc      = document.getElementById('expenseDesc').value.trim();
  const amount    = parseFloat(document.getElementById('expenseAmount').value);
  const paidBy    = document.getElementById('paidBy').value;
  const category  = document.getElementById('expenseCategory').value;
  const splitType = document.getElementById('splitType').value;

  if (!desc || isNaN(amount) || amount <= 0) { alert('Please fill in all fields'); return; }

  // Build splits
  let splits = [];
  if (splitType === 'equal') {
    const uuids = [...document.querySelectorAll('#splitWith input:checked')].map(el => el.value);
    if (!uuids.length) { alert('Select at least one person to split with'); return; }
    const share = parseFloat((amount / uuids.length).toFixed(2));
    splits = uuids.map(uuid => ({ user_uuid: uuid, amount: share }));
  } else if (splitType === 'custom') {
    splits = [...document.querySelectorAll('#splitCustomInputs input')]
      .map(el => ({ user_uuid: el.dataset.uuid, amount: parseFloat(el.value) || 0 }))
      .filter(s => s.amount > 0);
    const total = splits.reduce((s, c) => s + c.amount, 0);
    if (!splits.length) { alert('Enter at least one amount'); return; }
    if (Math.abs(total - amount) > 0.01) {
      alert(`Split amounts (${sym()}${total.toFixed(2)}) must equal the total (${sym()}${amount.toFixed(2)})`);
      return;
    }
  } else {
    const rows = [...document.querySelectorAll('#splitRatioInputs input')]
      .map(el => ({ uuid: el.dataset.uuid, ratio: parseFloat(el.value) || 0 }))
      .filter(r => r.ratio > 0);
    if (!rows.length) { alert('Enter at least one ratio value'); return; }
    const total = rows.reduce((s, r) => s + r.ratio, 0);
    splits = rows.map(r => ({ user_uuid: r.uuid, amount: parseFloat((amount * r.ratio / total).toFixed(2)) }));
  }

  if (editingExpenseId) {
    const { data: updated, error } = await sb.from('expenses')
      .update({ description: desc, amount, category, paid_by: paidBy })
      .eq('id', editingExpenseId)
      .select();
    if (error) { alert(error.message); return; }
    if (!updated?.length) {
      alert('Could not save changes — the expense update was blocked. Make sure Migration v5 has been run in your Supabase SQL Editor.');
      return;
    }
    await sb.from('expense_splits').delete().eq('expense_id', editingExpenseId);
    await sb.from('expense_splits').insert(splits.map(s => ({ expense_id: editingExpenseId, ...s })));
    await logEvent(`Updated "${desc}" · ${sym()}${amount.toFixed(2)}`, 'expense_updated');
  } else {
    const { data: expense, error } = await sb.from('expenses')
      .insert([{ group_id: currentGroup.id, description: desc, amount, paid_by: paidBy, category }])
      .select();
    if (error) { alert(error.message); return; }
    await sb.from('expense_splits').insert(splits.map(s => ({ expense_id: expense[0].id, ...s })));
    await logEvent(`Added "${desc}" · ${sym()}${amount.toFixed(2)}`, 'expense_added');
  }

  closeExpenseModal();
  await loadGroupExpenses(currentGroup.id);
  await Promise.all([loadBalances(currentGroup.id), loadActivity(currentGroup.id)]);
}

async function loadGroupExpenses(groupId) {
  const { data: expenses } = await sb.from('expenses')
    .select('*').eq('group_id', groupId).order('created_at', { ascending: false });

  const el = document.getElementById('expensesList');
  if (!expenses?.length) {
    el.innerHTML = '<p class="empty-msg">No expenses yet.</p>';
    return;
  }

  const nameMap = Object.fromEntries(groupMembers.map(m => [m.user_uuid, m.name]));
  el.innerHTML = expenses.map(e => {
    const icon = CATEGORIES[e.category] || '🧾';
    const canEdit = e.paid_by === currentUser?.id;
    return `
    <div class="expense-item">
      <div class="expense-icon">${icon}</div>
      <div class="expense-info">
        <div class="expense-desc">${esc(e.description)}</div>
        <div class="expense-meta">Paid by ${esc(nameMap[e.paid_by] || 'Unknown')} · ${new Date(e.created_at).toLocaleDateString()}</div>
      </div>
      <div class="expense-right">
        <div class="expense-amount">${sym()}${parseFloat(e.amount).toFixed(2)}</div>
        ${canEdit ? `<button class="edit-btn" onclick="openEditExpense(${e.id})">✏️</button>` : ''}
        ${canEdit ? `<button class="delete-btn" data-expid="${e.id}" data-desc="${esc(e.description)}" onclick="deleteExpense(+this.dataset.expid, this.dataset.desc)">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function deleteExpense(id, desc) {
  if (!confirm('Delete this expense? Splits will also be removed.')) return;
  await logEvent(`Deleted "${desc}"`, 'expense_deleted');
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await loadGroupExpenses(currentGroup.id);
  await Promise.all([loadBalances(currentGroup.id), loadActivity(currentGroup.id)]);
}

// ─── Balances ─────────────────────────────────────────────────────────────────

async function loadBalances(groupId) {
  const { data: expenses } = await sb
    .from('expenses').select('id, paid_by, amount').eq('group_id', groupId);

  if (!expenses?.length) {
    document.getElementById('balancesList').innerHTML = '<p class="empty-msg">✅ All settled up!</p>';
    return;
  }

  const expenseIds = expenses.map(e => e.id);
  const [{ data: splits }, { data: settlements }] = await Promise.all([
    sb.from('expense_splits').select('*').in('expense_id', expenseIds),
    sb.from('settlements').select('*').eq('group_id', groupId)
  ]);

  // net[uuid] = positive means they are owed money, negative means they owe
  const net = Object.fromEntries(groupMembers.map(m => [m.user_uuid, 0]));
  expenses.forEach(e => { net[e.paid_by] = (net[e.paid_by] || 0) + parseFloat(e.amount); });
  (splits || []).forEach(s => { net[s.user_uuid] = (net[s.user_uuid] || 0) - parseFloat(s.amount); });
  (settlements || []).forEach(s => {
    net[s.payer_uuid]    = (net[s.payer_uuid]    || 0) + parseFloat(s.amount);
    net[s.receiver_uuid] = (net[s.receiver_uuid] || 0) - parseFloat(s.amount);
  });

  const nameMap = Object.fromEntries(groupMembers.map(m => [m.user_uuid, m.name]));
  const el      = document.getElementById('balancesList');

  if (!simplifyEnabled) {
    const rows = Object.entries(net).filter(([, v]) => Math.abs(v) > 0.005);
    if (!rows.length) { el.innerHTML = '<p class="empty-msg">✅ All settled up!</p>'; return; }
    el.innerHTML = rows.map(([uuid, val]) => {
      const name  = nameMap[uuid] || uuid;
      const isMe  = uuid === currentUser?.id;
      const color = val > 0 ? '#34d399' : '#f87171';
      const label = val > 0 ? `is owed ${sym()}${val.toFixed(2)}` : `owes ${sym()}${Math.abs(val).toFixed(2)}`;
      return `<div class="balance-item ${isMe ? 'balance-highlight' : ''}">
        <div class="balance-text"><strong>${esc(name)}</strong> ${label}</div>
      </div>`;
    }).join('');
    return;
  }

  const debts   = simplifyDebts(net, nameMap);

  if (!debts.length) {
    el.innerHTML = '<p class="empty-msg">✅ All settled up!</p>';
    return;
  }

  el.innerHTML = debts.map(d => {
    const isMe = d.from === currentUser?.id || d.to === currentUser?.id;
    const settleBtn = d.from === currentUser?.id
      ? `<button class="settle-btn" data-to="${d.to}" data-name="${esc(d.toName)}" data-amount="${d.amount}" onclick="openSettleModal(this)">Settle</button>`
      : '';
    return `
      <div class="balance-item ${isMe ? 'balance-highlight' : ''}">
        <div class="balance-text">
          <strong>${esc(d.fromName)}</strong> owes <strong>${esc(d.toName)}</strong>
        </div>
        <div class="balance-right">
          <span class="balance-amount">${sym()}${d.amount.toFixed(2)}</span>
          ${settleBtn}
        </div>
      </div>`;
  }).join('');
}

// Greedy debt simplification algorithm
function simplifyDebts(net, nameMap) {
  const creditors = [], debtors = [];
  Object.entries(net).forEach(([uuid, amount]) => {
    const r = Math.round(amount * 100) / 100;
    if (r >  0.005) creditors.push({ uuid, amount:  r });
    if (r < -0.005) debtors.push({ uuid,  amount: -r });
  });

  const debts = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    debts.push({
      from:     debtors[i].uuid,    fromName: nameMap[debtors[i].uuid]   || debtors[i].uuid,
      to:       creditors[j].uuid,  toName:   nameMap[creditors[j].uuid] || creditors[j].uuid,
      amount:   Math.round(pay * 100) / 100
    });
    debtors[i].amount   -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount   < 0.005) i++;
    if (creditors[j].amount < 0.005) j++;
  }
  return debts;
}

// ─── Settle Up ────────────────────────────────────────────────────────────────

let settleTarget = null;

function openSettleModal(el) {
  settleTarget = { toUuid: el.dataset.to, toName: el.dataset.name, amount: parseFloat(el.dataset.amount) };
  document.getElementById('settleDesc').textContent =
    `You owe ${settleTarget.toName} ${sym()}${settleTarget.amount.toFixed(2)}`;
  document.getElementById('settleAmount').value = settleTarget.amount.toFixed(2);
  document.getElementById('settleModal').style.display = 'flex';
}

function closeSettleModal() {
  document.getElementById('settleModal').style.display = 'none';
  settleTarget = null;
}

function toggleSimplify() {
  simplifyEnabled = !simplifyEnabled;
  const btn = document.getElementById('simplifyToggle');
  btn.textContent = simplifyEnabled ? 'Simplified ✓' : 'Show simplified';
  btn.classList.toggle('active', simplifyEnabled);
  loadBalances(currentGroup.id);
}

async function confirmSettle() {
  if (!settleTarget) return;
  const amount = parseFloat(document.getElementById('settleAmount').value);
  if (isNaN(amount) || amount <= 0) { alert('Enter a valid amount'); return; }

  const { error } = await sb.from('settlements').insert([{
    group_id:      currentGroup.id,
    payer_uuid:    currentUser.id,
    receiver_uuid: settleTarget.toUuid,
    amount
  }]);
  if (error) { alert(error.message); return; }
  await logEvent(`Settled ${sym()}${amount.toFixed(2)} with ${settleTarget.toName}`, 'settled');

  closeSettleModal();
  await Promise.all([loadBalances(currentGroup.id), loadActivity(currentGroup.id)]);
}

// ─── Activity Feed ───────────────────────────────────────────────────────────

async function loadActivity(groupId) {
  const { data: events } = await sb.from('group_events')
    .select('*').eq('group_id', groupId)
    .order('created_at', { ascending: false }).limit(30);

  const el = document.getElementById('activityFeed');
  if (!events?.length) { el.innerHTML = '<p class="empty-msg">No activity yet.</p>'; return; }

  const nameMap = Object.fromEntries(groupMembers.map(m => [m.user_uuid, m.name]));
  const icons   = { expense_added: '➕', expense_updated: '✏️', expense_deleted: '🗑️', settled: '✅' };

  el.innerHTML = events.map(ev => `
    <div class="activity-item">
      <div class="activity-icon">${icons[ev.event_type] || '📋'}</div>
      <div class="activity-info">
        <div class="activity-title">${esc(ev.summary)}</div>
        <div class="activity-meta">${esc(nameMap[ev.user_uuid] || 'Someone')} · ${new Date(ev.created_at).toLocaleDateString()}</div>
      </div>
    </div>`).join('');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Close modals when clicking the overlay backdrop
document.addEventListener('click', e => {
  // Close user menu when clicking outside
  const userInfo = document.getElementById('userInfo');
  if (userInfo && !userInfo.contains(e.target)) closeUserMenu();
  // Close modals on backdrop click
  ['authModal', 'expenseModal', 'settleModal'].forEach(id => {
    const el = document.getElementById(id);
    if (e.target === el) el.style.display = 'none';
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();

async function _old_signup(){

 console.log("Signup clicked, email:", email.value);

 if (!name.value.trim()) {
  alert("Please enter your name");
  return;
 }

 const {error, data} = await sb.auth.signUp({
  email:email.value,
  password:password.value
 });

 console.log("Signup response:", {error, data});

 if(error) {
  console.error("Signup failed:", error.message);
  alert(error.message);
 } else {
  console.log("Signup successful!");
  
  // Store user name in users table
  if (data.user) {
   const {error: nameError} = await sb.from('users').insert([
    {id: data.user.id, name: name.value}
   ]);
   if (nameError) {
    console.error("Failed to save user name:", nameError);
   } else {
    console.log("User name saved successfully");
   }
  }
  
  alert("Signup complete! Please log in.");
  email.value = '';
  password.value = '';
  name.value = '';
 }
}

async function _old_login(){

 console.log("Login clicked, email:", email.value);

 const {error, data}=await sb.auth.signInWithPassword({
  email:email.value,
  password:password.value
 });

 console.log("Auth response:", {error, data});

 if(error) {
  console.error("Login failed:", error.message);
  alert(error.message);
 } else {
  console.log("Login successful!");
  document.getElementById('authModal').style.display = 'none';
  email.value = '';
  password.value = '';
  name.value = '';
 }

 load();
}

async function _old_logout(){
 console.log("Logout clicked");

 const {error} = await sb.auth.signOut();

 if(error) {
  console.error("Logout failed:", error.message);
 } else {
  console.log("Logout successful, reloading page...");
 }

 location.reload();
}

// Update UI with user info
async function updateUserUI() {
 const user = (await sb.auth.getUser()).data.user;
 const authBtn = document.getElementById('authBtn');
 const userInfo = document.getElementById('userInfo');
 const authModal = document.getElementById('authModal');
 
 if (user) {
  // Fetch user name
  const {data, error} = await sb.from('users').select('name').eq('id', user.id).single();
  
  if (data) {
   authBtn.style.display = 'none';
   userInfo.style.display = 'block';
   document.querySelector('.user-name').textContent = data.name;
   document.querySelector('.user-email').textContent = user.email;
   currentUser = {id: user.id, email: user.email, name: data.name};
  }
 } else {
  authBtn.style.display = 'block';
  userInfo.style.display = 'none';
  authModal.style.display = 'none';
  currentUser = null;
 }
}

async function _old_createGroup(){

 console.log("Create group clicked, name:", groupName.value);

 const user=(await sb.auth.getUser()).data.user;

 if(!user){
  console.warn("Create group: User not logged in");
  alert("Login first");
  return;
 }

 console.log("Creating group for user:", user.id);

 const res=await sb.from("groups")
 .insert([{
  name:groupName.value,
  invite_code:code(),
  owner_uuid:user.id
 }])
 .select();

 if(res.error) {
  console.error("Group creation failed:", res.error);
  return;
 }

 const group=res.data[0];
 console.log("Group created:", group);

 const memberRes=await sb.from("group_members")
 .insert([{
  group_id:group.id,
  user_uuid:user.id,
  user_email:user.email
 }]);

 if(memberRes.error) {
  console.error("Failed to add user to group:", memberRes.error);
 } else {
  console.log("User added to group");
 }

 console.log("Group created successfully, invite code:", group.invite_code);
 alert("Invite code: "+group.invite_code);

 load();
}

async function _old_joinGroup(){

 console.log("Join group clicked, code:", inviteCode.value);

 const user=(await sb.auth.getUser()).data.user;

 if(!user) {
  console.warn("Join group: User not logged in");
  alert("Login first");
  return;
 }

 console.log("Looking for group with code:", inviteCode.value);

 const res=await sb.from("groups")
 .select("*")
 .eq("invite_code",inviteCode.value)
 .single();

 if(!res.data){
  console.error("Group not found for code:", inviteCode.value);
  alert("Invalid code");
  return;
 }

 console.log("Found group:", res.data);

 const memberRes=await sb.from("group_members")
 .insert([{
  group_id:res.data.id,
  user_uuid:user.id,
  user_email:user.email
 }]);

 if(memberRes.error) {
  console.error("Failed to join group:", memberRes.error);
 } else {
  console.log("Successfully joined group:", res.data.name);
 }

 load();
}

async function load(){

 console.log("Loading user data...");

 const user=(await sb.auth.getUser()).data.user;

 if(user) {
  console.log("User logged in:", user.email);
 } else {
  console.log("No user logged in");
 }

 if (document.getElementById('status')) {
  document.getElementById('status').innerText=user ? "Logged in: "+user.email : "Not logged in";
 }
 
 // Update user UI
 await updateUserUI();

 if(!user) {
  console.log("Skipping group load - user not logged in");
  return;
 }

 console.log("Fetching groups for user:", user.id);

 const m=await sb.from("group_members")
 .select("*")
 .eq("user_uuid",user.id);

 if(m.error) {
  console.error("Failed to fetch group memberships:", m.error);
  return;
 }

 const ids=m.data.map(x=>x.group_id);
 console.log("User group IDs:", ids);

 if(ids.length===0){
  console.log("User has no groups");
  groups.innerHTML="No groups";
  return;
 }

 const g=await sb.from("groups")
 .select("*")
 .in("id",ids);

 if(g.error) {
  console.error("Failed to fetch groups:", g.error);
  return;
 }

 console.log("Loaded groups:", g.data);

 groups.innerHTML="";

 g.data.forEach(x=>{
  groups.innerHTML += `
  <div class="item">
  <strong>${x.name}</strong><br>
  Invite Code: ${x.invite_code}
  </div>`;
 });
}

