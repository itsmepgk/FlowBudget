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

function toggleAuthPanel() {
  const modal = document.getElementById('authModal');
  modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
  if (modal.style.display === 'flex') document.getElementById('email').focus();
}

async function signup() {
  const emailVal = document.getElementById('email').value.trim();
  const nameVal  = document.getElementById('name').value.trim();
  const passVal  = document.getElementById('password').value;
  const status   = document.getElementById('authStatus');

  if (!nameVal)  { status.textContent = 'Please enter your name';  return; }
  if (!emailVal) { status.textContent = 'Please enter your email'; return; }

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

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const { data: { user } } = await sb.auth.getUser();
  currentUser = user;

  const authBtn         = document.getElementById('authBtn');
  const userInfoEl      = document.getElementById('userInfo');
  const loggedInSection = document.getElementById('loggedInSection');
  const guestBanner     = document.getElementById('guestBanner');

  if (user) {
    const { data } = await sb.from('users').select('name').eq('id', user.id).single();
    currentUser.name = data?.name || user.email;
    authBtn.style.display = 'none';
    userInfoEl.style.display = 'flex';
    document.getElementById('userNameDisplay').textContent = currentUser.name;
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

let realtimeChannel = null;

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
    .subscribe();
}

function unsubscribeFromGroup() {
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
}

function goBack() {
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
    name: nameMap[m.user_uuid] || m.user_email
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

function openExpenseModal() {
  if (!currentUser) { alert('Login first'); return; }
  document.getElementById('paidBy').innerHTML = groupMembers.map(m =>
    `<option value="${m.user_uuid}" ${m.user_uuid === currentUser.id ? 'selected' : ''}>${esc(m.name)}</option>`
  ).join('');
  document.getElementById('expenseDesc').value = '';
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseCategory').value = 'other';
  document.getElementById('splitWith').innerHTML = groupMembers.map(m =>
    `<label class="split-member"><input type="checkbox" value="${m.user_uuid}" checked> ${esc(m.name)}</label>`
  ).join('');
  document.getElementById('expenseModal').style.display = 'flex';
}

function closeExpenseModal() {
  document.getElementById('expenseModal').style.display = 'none';
}

async function addExpense() {
  const desc   = document.getElementById('expenseDesc').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  const paidBy = document.getElementById('paidBy').value;

  if (!desc || isNaN(amount) || amount <= 0) { alert('Please fill in all fields'); return; }

  const category = document.getElementById('expenseCategory').value;
  const { data: expense, error } = await sb.from('expenses')
    .insert([{ group_id: currentGroup.id, description: desc, amount, paid_by: paidBy, category }])
    .select();
  if (error) { alert(error.message); return; }

  const splitWith = [...document.querySelectorAll('#splitWith input:checked')].map(el => el.value);
  if (!splitWith.length) { alert('Select at least one person to split with'); return; }
  const share = parseFloat((amount / splitWith.length).toFixed(2));
  await sb.from('expense_splits').insert(
    splitWith.map(uuid => ({ expense_id: expense[0].id, user_uuid: uuid, amount: share }))
  );

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
    const canDelete = e.paid_by === currentUser?.id;
    return `
    <div class="expense-item">
      <div class="expense-icon">${icon}</div>
      <div class="expense-info">
        <div class="expense-desc">${esc(e.description)}</div>
        <div class="expense-meta">Paid by ${esc(nameMap[e.paid_by] || 'Unknown')} · ${new Date(e.created_at).toLocaleDateString()}</div>
      </div>
      <div class="expense-right">
        <div class="expense-amount">${sym()}${parseFloat(e.amount).toFixed(2)}</div>
        ${canDelete ? `<button class="delete-btn" onclick="deleteExpense(${e.id})">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense? Splits will also be removed.')) return;
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await loadGroupExpenses(currentGroup.id);
  await loadBalances(currentGroup.id);
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
  const debts   = simplifyDebts(net, nameMap);
  const el      = document.getElementById('balancesList');

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

async function confirmSettle() {
  if (!settleTarget) return;
  const amount = parseFloat(document.getElementById('settleAmount').value);
  if (isNaN(amount) || amount <= 0) { alert('Enter a valid amount'); return; }

  const { error } = await sb.from('settlements').insert([{
    group_id:     currentGroup.id,
    payer_uuid:   currentUser.id,
    receiver_uuid: settleTarget.toUuid,
    amount
  }]);
  if (error) { alert(error.message); return; }

  closeSettleModal();
  await Promise.all([loadBalances(currentGroup.id), loadActivity(currentGroup.id)]);
}

// ─── Activity Feed ───────────────────────────────────────────────────────────

async function loadActivity(groupId) {
  const [{ data: expenses }, { data: settlements }] = await Promise.all([
    sb.from('expenses').select('id, description, amount, paid_by, category, created_at')
      .eq('group_id', groupId).order('created_at', { ascending: false }).limit(20),
    sb.from('settlements').select('payer_uuid, receiver_uuid, amount, created_at')
      .eq('group_id', groupId).order('created_at', { ascending: false }).limit(20)
  ]);

  const nameMap = Object.fromEntries(groupMembers.map(m => [m.user_uuid, m.name]));
  const events = [
    ...(expenses || []).map(e => ({ type: 'expense', date: new Date(e.created_at), data: e })),
    ...(settlements || []).map(s => ({ type: 'settle', date: new Date(s.created_at), data: s }))
  ].sort((a, b) => b.date - a.date).slice(0, 15);

  const el = document.getElementById('activityFeed');
  if (!events.length) { el.innerHTML = '<p class="empty-msg">No activity yet.</p>'; return; }

  el.innerHTML = events.map(ev => {
    if (ev.type === 'expense') {
      const e = ev.data;
      return `
        <div class="activity-item">
          <div class="activity-icon">${CATEGORIES[e.category] || '\u{1F9FE}'}</div>
          <div class="activity-info">
            <div class="activity-title">${esc(e.description)}</div>
            <div class="activity-meta">${esc(nameMap[e.paid_by] || 'Someone')} paid ${sym()}${parseFloat(e.amount).toFixed(2)} · ${ev.date.toLocaleDateString()}</div>
          </div>
        </div>`;
    }
    const s = ev.data;
    return `
      <div class="activity-item settle-event">
        <div class="activity-icon">✅</div>
        <div class="activity-info">
          <div class="activity-title">${esc(nameMap[s.payer_uuid] || 'Someone')} settled up with ${esc(nameMap[s.receiver_uuid] || 'Someone')}</div>
          <div class="activity-meta">${sym()}${parseFloat(s.amount).toFixed(2)} · ${ev.date.toLocaleDateString()}</div>
        </div>
      </div>`;
  }).join('');
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

