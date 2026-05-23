console.log("Initializing Supabase client...");

const sb = window.supabase.createClient(
 CONFIG.SUPABASE_URL,
 CONFIG.SUPABASE_ANON_KEY
);

console.log("Supabase client initialized");

let currentUser = null;

// Toggle auth panel (login modal)
function toggleAuthPanel() {
 const modal = document.getElementById('authModal');
 if (modal.style.display === 'none' || !modal.style.display) {
  modal.style.display = 'flex';
  document.getElementById('email').focus();
 } else {
  modal.style.display = 'none';
 }
}

function code(){
 return Math.random().toString(36).substring(2,8).toUpperCase();
}

async function signup(){

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

async function login(){

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

async function logout(){
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

async function createGroup(){

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

async function joinGroup(){

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
// Close modal when clicking outside
document.addEventListener('click', function(event) {
 const modal = document.getElementById('authModal');
 const authBtn = document.getElementById('authBtn');
 if (modal && event.target === modal) {
  modal.style.display = 'none';
 }
});
load();
