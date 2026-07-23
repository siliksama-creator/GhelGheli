// ignore_for_file: use_build_context_synchronously, curly_braces_in_flow_control_structures
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shamsi_date/shamsi_date.dart';
import 'api_client.dart';

const avatarFiles = [
  'avatar_1_football.png','avatar_2_trophy.png','avatar_3_star.png','avatar_4_rocket.png','avatar_5_lion.png',
  'avatar_6_tiger.png','avatar_7_eagle.png','avatar_8_target.png','avatar_9_bolt.png','avatar_10_crown.png',
];
String avatarAsset(Object? key) => 'assets/avatars/${(key ?? avatarFiles.first).toString()}';

void main() => runApp(const GhelGheliApp());

class GhelGheliApp extends StatefulWidget {
  const GhelGheliApp({super.key});
  @override State<GhelGheliApp> createState() => _GhelGheliAppState();
}

class _GhelGheliAppState extends State<GhelGheliApp> {
  final api = ApiClient();
  bool ready = false;
  bool dark = true;

  @override void initState() { super.initState(); api.loadToken().then((_) => setState(() => ready = true)); }

  @override Widget build(BuildContext context) {
    final theme = ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff00d49a), brightness: dark ? Brightness.dark : Brightness.light), fontFamily: 'Tahoma', scaffoldBackgroundColor: dark ? const Color(0xff07111f) : const Color(0xfff3f8ff));
    return MaterialApp(
      title: 'قلقلی', debugShowCheckedModeBanner: false, locale: const Locale('fa'), supportedLocales: const [Locale('fa')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: theme, builder: (context, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
      home: !ready ? const Splash() : api.token == null
          ? AuthScreen(api: api, onDone: () => setState(() {}))
          : api.isAdmin
              ? AdminShell(api: api, onLogout: () async { await api.logout(); setState(() {}); }, dark: dark, onTheme: () => setState(() => dark = !dark))
              : HomeShell(api: api, onLogout: () async { await api.logout(); setState(() {}); }, dark: dark, onTheme: () => setState(() => dark = !dark)),
    );
  }
}

class Splash extends StatelessWidget { const Splash({super.key}); @override Widget build(BuildContext c) => const Scaffold(body: Center(child: HeroLogo())); }
class HeroLogo extends StatelessWidget { const HeroLogo({super.key}); @override Widget build(BuildContext c) => Column(mainAxisSize: MainAxisSize.min, children: [Image.asset('assets/brand/logo.png', width: 240, height: 200, fit: BoxFit.contain), const SizedBox(height: 6), const Text('قلقلی', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900))]); }
class CardShell extends StatelessWidget { final Widget child; const CardShell({super.key, required this.child}); @override Widget build(BuildContext c) => Container(constraints: const BoxConstraints(maxWidth: 720), padding: const EdgeInsets.all(20), decoration: BoxDecoration(borderRadius: BorderRadius.circular(28), color: Theme.of(c).colorScheme.surface.withValues(alpha: .9), border: Border.all(color: Colors.white.withValues(alpha: .10)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .22), blurRadius: 35, offset: const Offset(0, 14))]), child: child); }

class AuthScreen extends StatefulWidget { final ApiClient api; final VoidCallback onDone; const AuthScreen({super.key, required this.api, required this.onDone}); @override State<AuthScreen> createState() => _AuthScreenState(); }
class _AuthScreenState extends State<AuthScreen> {
  final mobile = TextEditingController(text: 'Admin');
  final pass = TextEditingController();
  final code = TextEditingController();
  final name = TextEditingController();
  bool registerMode = false;
  bool adminMode = false;
  bool loading = false;
  String? msg;

  Future<void> run(Future<void> Function() fn) async { setState(() { loading = true; msg = null; }); try { await fn(); } catch (e) { msg = apiError(e); } finally { if (mounted) setState(() => loading = false); } }

  @override Widget build(BuildContext c) => Scaffold(body: Container(decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xff0b2b4f), Color(0xff07111f)])), child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: CardShell(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    const HeroLogo(), const SizedBox(height: 22),
    SegmentedButton<String>(segments: const [ButtonSegment(value: 'login', label: Text('ورود کاربر')), ButtonSegment(value: 'register', label: Text('ثبت‌نام')), ButtonSegment(value: 'admin', label: Text('ورود مدیر'))], selected: {adminMode ? 'admin' : registerMode ? 'register' : 'login'}, onSelectionChanged: (s) => setState(() { adminMode = s.first == 'admin'; registerMode = s.first == 'register'; if (adminMode) { mobile.text = 'Admin'; pass.clear(); } })),
    const SizedBox(height: 16),
    TextField(controller: mobile, keyboardType: adminMode ? TextInputType.text : TextInputType.phone, decoration: InputDecoration(labelText: adminMode ? 'نام کاربری مدیر' : 'شماره موبایل')),
    if (registerMode) ...[const SizedBox(height: 10), TextField(controller: name, decoration: const InputDecoration(labelText: 'نام مستعار اختیاری')), const SizedBox(height: 6), const Text('ثبت‌نام سریع است؛ بعد از ورود از بخش پروفایل اطلاعات کامل را تکمیل کن.')],
    const SizedBox(height: 10), TextField(controller: pass, obscureText: true, decoration: const InputDecoration(labelText: 'رمز عبور')), const SizedBox(height: 18),
    FilledButton.icon(icon: Icon(adminMode ? Icons.admin_panel_settings : Icons.login), onPressed: loading ? null : () => run(() async {
      if (adminMode) { final r = await widget.api.post('/api/admin/auth/login', {'username': mobile.text, 'password': pass.text}); await widget.api.saveToken(r['token'], admin: true); }
      else if (registerMode) { final r = await widget.api.post('/api/auth/register-password', {'mobile': mobile.text, 'password': pass.text, 'nickname': name.text.isEmpty ? mobile.text : name.text, 'profileAvatarKey': avatarFiles.first}); await widget.api.saveToken(r['token']); }
      else { final r = await widget.api.post('/api/auth/login', {'mobile': mobile.text, 'password': pass.text}); await widget.api.saveToken(r['token']); }
      widget.onDone();
    }), label: Text(loading ? 'لطفاً صبر کنید...' : adminMode ? 'ورود به مدیریت' : registerMode ? 'ساخت حساب' : 'ورود')),
    TextButton.icon(onPressed: () => setState(() { adminMode = true; registerMode = false; mobile.text = 'Admin'; pass.clear(); }), icon: const Icon(Icons.admin_panel_settings), label: const Text('ورود مدیر تست: نام کاربری Admin، رمز را وارد کنید')),
    if (msg != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(msg!, style: TextStyle(color: Theme.of(c).colorScheme.primary))),
  ]))))));
}

// -------------------- User app --------------------
class HomeShell extends StatefulWidget { final ApiClient api; final VoidCallback onLogout; final bool dark; final VoidCallback onTheme; const HomeShell({super.key, required this.api, required this.onLogout, required this.dark, required this.onTheme}); @override State<HomeShell> createState() => _HomeShellState(); }
class _HomeShellState extends State<HomeShell> { int idx = 0; Map<String, dynamic>? profile; late final pages = [DashboardPage(api: widget.api, reloadProfile: loadProfile), RewardsPage(api: widget.api), LeaguePage(api: widget.api), ChatPage(api: widget.api), SupportPage(api: widget.api), ProfilePage(api: widget.api, reloadProfile: loadProfile)]; @override void initState() { super.initState(); loadProfile(); registerFcm(); } Future<void> loadProfile() async { try { final d = await widget.api.get('/api/profile'); setState(() => profile = Map<String, dynamic>.from(d)); } catch (_) {} } Future<void> registerFcm() async { try { await Firebase.initializeApp(); await FirebaseMessaging.instance.requestPermission(); final token = await FirebaseMessaging.instance.getToken(); if (token != null) await widget.api.patch('/api/profile', {'fcmToken': token}); } catch (_) {} }
  @override Widget build(BuildContext c) => Scaffold(appBar: AppBar(title: const Text('قلقلی'), actions: [IconButton(onPressed: widget.onTheme, icon: Icon(widget.dark ? Icons.light_mode : Icons.dark_mode)), IconButton(onPressed: widget.onLogout, icon: const Icon(Icons.logout))]), body: AnimatedSwitcher(duration: const Duration(milliseconds: 350), child: pages[idx]), bottomNavigationBar: NavigationBar(selectedIndex: idx, onDestinationSelected: (i) => setState(() => idx = i), destinations: const [NavigationDestination(icon: Icon(Icons.home_rounded), label: 'خانه'), NavigationDestination(icon: Icon(Icons.card_giftcard), label: 'جوایز'), NavigationDestination(icon: Icon(Icons.emoji_events), label: 'لیگ'), NavigationDestination(icon: Icon(Icons.chat_bubble), label: 'چت روم'), NavigationDestination(icon: Icon(Icons.support_agent), label: 'پشتیبانی'), NavigationDestination(icon: Icon(Icons.person), label: 'پروفایل')])); }
class DashboardPage extends StatefulWidget {
  final ApiClient api;
  final Future<void> Function() reloadProfile;
  const DashboardPage({super.key, required this.api, required this.reloadProfile});
  @override State<DashboardPage> createState() => _DashboardPageState();
}
class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? data;
  List<Map<String, dynamic>> rewards = [];
  final code = TextEditingController();
  String? msg;
  bool sending = false;
  @override void initState() { super.initState(); load(); }
  Future<void> load() async {
    final d = await widget.api.get('/api/profile');
    final rw = await widget.api.get('/api/rewards');
    setState(() { data = Map<String, dynamic>.from(d); rewards = List<Map<String, dynamic>>.from(rw); });
  }
  @override
  Widget build(BuildContext c) {
    final user = data?['user'];
    final inv = List<Map<String, dynamic>>.from(data?['inventory'] ?? []);
    final points = NumberParser.toInt(user?['current_points']);
    final sorted = [...rewards]..sort((a, b) => NumberParser.toInt(a['required_points']).compareTo(NumberParser.toInt(b['required_points'])));
    Map<String, dynamic>? nextReward;
    for (final r in sorted) { if (points < NumberParser.toInt(r['required_points'])) { nextReward = r; break; } }
    nextReward ??= sorted.isNotEmpty ? sorted.last : null;
    return RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(18), children: [
      HeroHeader(points: points, nickname: user?['nickname'] ?? 'قهرمان', nextReward: nextReward),
      const SizedBox(height: 18),
      CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('ثبت کد کارت های قلقلی', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6), const Text('(پک کارت های قلقلی بصورت فیزیکی در فروشگاه ها و سوپرمارکت ها به فروش می رسند.)'), const SizedBox(height: 10),
        TextField(controller: code, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(prefixIcon: Icon(Icons.qr_code_2), labelText: 'کد طولانی روی کارت')),
        const SizedBox(height: 12),
        FilledButton.icon(icon: const Icon(Icons.add_card), label: Text(sending ? 'در حال ثبت...' : 'ثبت و دریافت امتیاز'), onPressed: sending ? null : () async { setState(() => sending = true); try { final r = await widget.api.post('/api/cards/redeem', {'code': code.text}); msg = '${r['message']} +${faNum(r['addedPoints'])} امتیاز'; code.clear(); await load(); await widget.reloadProfile(); } catch (e) { msg = apiError(e); } finally { if (mounted) setState(() => sending = false); } }),
        if (msg != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(msg!))
      ])),
      const SizedBox(height: 18),
      const Text('موجودی کارت‌ها', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
      const SizedBox(height: 10),
      SizedBox(height: 225, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: inv.length, separatorBuilder: (_, __) => const SizedBox(width: 14), itemBuilder: (_, i) => FootballCard(item: inv[i]))),
    ]));
  }
}
class NumberParser { static int toInt(Object? v) => int.tryParse('$v') ?? 0; }
class HeroHeader extends StatelessWidget {
  final int points;
  final String nickname;
  final Map<String, dynamic>? nextReward;
  const HeroHeader({super.key, required this.points, required this.nickname, this.nextReward});
  @override Widget build(BuildContext c) {
    final required = NumberParser.toInt(nextReward?['required_points']);
    final remaining = required > points ? required - points : 0;
    final progress = required > 0 ? (points / required).clamp(0.0, 1.0) : 0.0;
    final image = fullAssetUrl(nextReward?['image_url']);
    return Container(padding: const EdgeInsets.all(24), decoration: BoxDecoration(borderRadius: BorderRadius.circular(34), gradient: const LinearGradient(colors: [Color(0xff00d49a), Color(0xff1c78ff)]), boxShadow: [BoxShadow(color: Colors.tealAccent.withValues(alpha: .25), blurRadius: 35)]), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('سلام $nickname 👋', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white)), const SizedBox(height: 10), Text('${faNum(points)} امتیاز فعلی', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white))])), if (image.isNotEmpty) ClipRRect(borderRadius: BorderRadius.circular(18), child: Image.network(image, width: 74, height: 74, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()))]),
      const SizedBox(height: 16),
      TweenAnimationBuilder<double>(duration: const Duration(milliseconds: 900), tween: Tween(begin: 0, end: progress), builder: (_, v, __) => ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: v, minHeight: 12, color: Colors.white, backgroundColor: Colors.white24))),
      const SizedBox(height: 8),
      Text(nextReward == null ? 'هنوز جایزه‌ای تعریف نشده است' : remaining == 0 ? 'شما به جایزه ${nextReward!['name']} رسیده‌اید' : 'تا جایزه ${nextReward!['name']}: ${faNum(remaining)} امتیاز مانده', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
    ]));
  }
}
class FootballCard extends StatelessWidget { final Map<String, dynamic> item; const FootballCard({super.key, required this.item}); @override Widget build(BuildContext c) { final img = fullAssetUrl(item['image_url']); return Container(width: 170, padding: const EdgeInsets.all(14), decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xffffd36b), Color(0xff0b2b4f), Color(0xff00d49a)]), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .25), blurRadius: 22, offset: const Offset(0, 12))]), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(18), child: img.isNotEmpty ? Image.network(img, width: double.infinity, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Center(child: Text('⚽', style: TextStyle(fontSize: 44)))) : const Center(child: Text('⚽', style: TextStyle(fontSize: 44))))), const SizedBox(height: 10), Text(item['name'] ?? 'کارت', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)), Text('تعداد: ${faNum(item['quantity'])}', style: const TextStyle(color: Colors.white)), Text('${faNum(item['point_value'])} امتیاز', style: const TextStyle(color: Colors.white70))])); } }
class RewardsPage extends StatefulWidget { final ApiClient api; const RewardsPage({super.key, required this.api}); @override State<RewardsPage> createState() => _RewardsPageState(); }
class _RewardsPageState extends State<RewardsPage> { List rewards = []; @override void initState() { super.initState(); load(); } Future<void> load() async => setState(() {}); @override Widget build(BuildContext c) => FutureBuilder(future: widget.api.get('/api/rewards'), builder: (c, s) { if (!s.hasData) return const Center(child: CircularProgressIndicator()); rewards = s.data as List; return ListView(padding: const EdgeInsets.all(18), children: rewards.map((r) => CardShell(child: ListTile(leading: Icon(r['reward_type'] == 'cash' ? Icons.payments : Icons.inventory_2), title: Text(r['name'] ?? ''), subtitle: Text('${faNum(r['required_points'])} امتیاز — ${r['reward_value']}'), trailing: FilledButton.tonal(onPressed: r['eligible'] == true ? () async { await widget.api.post('/api/rewards/${r['id']}/claim', {}); if (mounted) ScaffoldMessenger.of(c).showSnackBar(const SnackBar(content: Text('درخواست جایزه ثبت شد'))); } : null, child: const Text('دریافت'))))).toList()); }); }
class LeaguePage extends StatefulWidget { final ApiClient api; const LeaguePage({super.key, required this.api}); @override State<LeaguePage> createState() => _LeaguePageState(); }
class _LeaguePageState extends State<LeaguePage> { Map? d; Timer? t; @override void initState() { super.initState(); load(); t = Timer.periodic(const Duration(seconds: 12), (_) => load()); } @override void dispose() { t?.cancel(); super.dispose(); } Future<void> load() async { final x = await widget.api.get('/api/league/current'); if (mounted) setState(() => d = x); } @override Widget build(BuildContext c) { final entries = List<Map>.from(d?['entries'] ?? []); final season = d?['season']; final end = season?['ends_at'] == null ? null : DateTime.parse(season['ends_at']); final left = end == null ? '' : '${faNum(end.difference(DateTime.now()).inDays)} روز تا پایان'; return ListView(padding: const EdgeInsets.all(18), children: [HeroHeader(points: entries.isEmpty ? 0 : entries.first['points'], nickname: 'لیگ ماهانه'), Text(left, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)), const SizedBox(height: 12), ...entries.asMap().entries.map((e) => RankTile(rank: e.key + 1, row: e.value, onTap: () => showPublicProfile(c, widget.api, e.value['user_id']))) ]); } }
class RankTile extends StatelessWidget { final int rank; final Map row; final VoidCallback? onTap; const RankTile({super.key, required this.rank, required this.row, this.onTap}); @override Widget build(BuildContext c) => InkWell(onTap: onTap, borderRadius: BorderRadius.circular(20), child: Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(16), decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), color: rank <= 3 ? Colors.amber.withValues(alpha: .22) : Theme.of(c).colorScheme.surfaceContainerHighest), child: Row(children: [CircleAvatar(child: Text(faNum(rank))), const SizedBox(width: 12), Expanded(child: Text(row['nickname'] ?? row['first_name'] ?? 'کاربر')), Text('${faNum(row['points'])} امتیاز', style: const TextStyle(fontWeight: FontWeight.bold))]))); }
class ChatPage extends StatefulWidget { final ApiClient api; const ChatPage({super.key, required this.api}); @override State<ChatPage> createState()=>_ChatPageState(); }
class _ChatPageState extends State<ChatPage>{final text=TextEditingController();List msgs=[];List stickers=[];Map? reply;String? error;Timer? t;@override void initState(){super.initState();load();t=Timer.periodic(const Duration(seconds:5),(_)=>load());}@override void dispose(){t?.cancel();super.dispose();}Future<void> load()async{try{final cfg=await widget.api.get('/api/chat/config');if(cfg['eligible']!=true){setState(()=>error='برای چت باید حداقل ${faNum(cfg['minLifetimePoints'])} امتیاز تاریخی داشته باشید.');return;}final m=await widget.api.get('/api/chat/messages');final st=await widget.api.get('/api/chat/stickers');setState((){msgs=m;stickers=st;error=null;});}catch(e){setState(()=>error=apiError(e));}}Future<void> send({String? stickerId})async{try{await widget.api.post('/api/chat/messages',{'message':text.text,'stickerId':stickerId,'replyTo':reply?['id']});text.clear();reply=null;await load();}catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(apiError(e))));}}Future<void> like(String id)async{await widget.api.post('/api/chat/messages/$id/like',{});await load();}@override Widget build(BuildContext c)=>Column(children:[CardShell(child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:const [Text('چت روم قلقلی',style:TextStyle(fontWeight:FontWeight.w900,fontSize:18)),Text('کاربران در این قسمت میتوانند باهم گفتگو کنند. (از الفاظ رکیک و بحث های سیاسی جدا خودداری بشه.)') ])),if(error!=null)Expanded(child:Center(child:CardShell(child:Text(error!,textAlign:TextAlign.center))))else Expanded(child:ListView(padding:const EdgeInsets.all(14),children:[SizedBox(height:72,child:ListView.separated(scrollDirection:Axis.horizontal,itemCount:stickers.length,separatorBuilder:(_,__)=>const SizedBox(width:8),itemBuilder:(_,i){final st=stickers[i];return InkWell(onTap:()=>send(stickerId:st['id']),child:Container(width:64,padding:const EdgeInsets.all(6),decoration:BoxDecoration(color:Colors.white10,borderRadius:BorderRadius.circular(16)),child:Image.network(fullAssetUrl(st['image_url']),fit:BoxFit.contain)));})),...msgs.map((m)=>ListTile(leading:AvatarImage(keyName:m['profile_avatar_key'],imageUrl:m['profile_image_url'],radius:22),title:Text(m['nickname']??m['first_name']??'کاربر'),onTap:()=>showPublicProfile(c, widget.api, m['user_id']),subtitle:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[if(m['reply_text']!=null)Text('↩ ${m['reply_nickname']??'کاربر'}: ${m['reply_text']}',style:const TextStyle(color:Colors.lightGreenAccent)),m['message_type']=='sticker'&&m['sticker_url']!=null?Image.network(fullAssetUrl(m['sticker_url']),width:110,height:110,fit:BoxFit.contain):Text(m['message_text']??''),Row(children:[TextButton(onPressed:()=>setState(()=>reply=Map.from(m)),child:const Text('ریپلای')),TextButton(onPressed:()=>like(m['id']),child:Text('❤ ${faNum(m['like_count']??0)}'))])]),trailing:IconButton(icon:const Icon(Icons.flag),onPressed:()=>widget.api.post('/api/chat/messages/${m['id']}/report',{}))))])),if(reply!=null)Container(width:double.infinity,padding:const EdgeInsets.all(8),color:Colors.lightGreen.withValues(alpha: .15),child:Row(children:[Expanded(child:Text('در پاسخ به: ${reply?['message_text']??''}')),IconButton(onPressed:()=>setState(()=>reply=null),icon:const Icon(Icons.close))])),SafeArea(child:Padding(padding:const EdgeInsets.all(12),child:Row(children:[Expanded(child:TextField(controller:text,enabled:error==null,decoration:const InputDecoration(hintText:'پیام گروهی...'))),IconButton.filled(onPressed:error!=null?null:()=>send(),icon:const Icon(Icons.send))])))]);}
class SupportPage extends StatefulWidget { final ApiClient api; const SupportPage({super.key, required this.api}); @override State<SupportPage> createState() => _SupportPageState(); }
class _SupportPageState extends State<SupportPage> { final subject = TextEditingController(), msg = TextEditingController(); List tickets = []; @override void initState() { super.initState(); load(); } Future<void> load() async { final d = await widget.api.get('/api/support/tickets'); setState(() => tickets = d); } @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(18), children: [CardShell(child: Column(children: [TextField(controller: subject, decoration: const InputDecoration(labelText: 'موضوع')), TextField(controller: msg, decoration: const InputDecoration(labelText: 'پیام'), maxLines: 4), const SizedBox(height: 12), FilledButton(onPressed: () async { await widget.api.post('/api/support/tickets', {'subject': subject.text, 'message': msg.text}); subject.clear(); msg.clear(); load(); }, child: const Text('ارسال تیکت'))])), const SizedBox(height: 16), ...tickets.map((t) => Card(child: ListTile(title: Text(t['subject']), subtitle: Text('وضعیت: ${t['status']}'))))]); }


class AvatarImage extends StatelessWidget {
  final Object? keyName;
  final Object? imageUrl;
  final double radius;
  const AvatarImage({super.key, this.keyName, this.imageUrl, this.radius = 28});
  @override Widget build(BuildContext c) {
    final url = fullAssetUrl(imageUrl);
    if (url.isNotEmpty) return CircleAvatar(radius: radius, backgroundImage: NetworkImage(url));
    return CircleAvatar(radius: radius, backgroundImage: AssetImage(avatarAsset(keyName)));
  }
}

Future<void> showPublicProfile(BuildContext context, ApiClient api, Object? userId) async {
  if (userId == null) return;
  showModalBottomSheet(context: context, showDragHandle: true, builder: (_) => FutureBuilder(
    future: api.get('/api/users/$userId/public'),
    builder: (c, s) {
      if (!s.hasData) return const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()));
      final u = Map<String, dynamic>.from(s.data as Map);
      final rewards = List<Map<String, dynamic>>.from(u['rewards'] ?? []);
      final cards = List<Map<String, dynamic>>.from(u['cards'] ?? []);
      final joined = u['joined_at'] == null ? '-' : DateTime.tryParse('${u['joined_at']}')?.toLocal().toString().split('.').first ?? '-';
      return Directionality(textDirection: TextDirection.rtl, child: Padding(padding: const EdgeInsets.all(18), child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [AvatarImage(keyName: u['profile_avatar_key'], imageUrl: u['profile_image_url'], radius: 34), const SizedBox(width: 12), Expanded(child: Text(u['nickname'] ?? 'کاربر', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20)))]),
        const SizedBox(height: 12),
        Text('زمان عضویت: $joined'),
        Text('امتیاز تاریخی کسب‌شده: ${faNum(u['lifetime_points'])}'),
        Text('امتیاز فعلی: ${faNum(u['current_points'])}'),
        const Divider(),
        const Text('کارت‌های ثبت‌شده', style: TextStyle(fontWeight: FontWeight.bold)),
        if (cards.isEmpty) const Text('هنوز کارتی ثبت نکرده است'),
        ...cards.take(8).map((card) => ListTile(leading: card['image_url'] != null ? Image.network(fullAssetUrl(card['image_url']), width: 38, height: 38, fit: BoxFit.cover) : const Icon(Icons.credit_card), title: Text(card['name'] ?? ''), subtitle: Text('تعداد ثبت: ${faNum(card['registered_count'])}'))),
        const Divider(),
        const Text('جوایز دریافت‌شده', style: TextStyle(fontWeight: FontWeight.bold)),
        if (rewards.isEmpty) const Text('هنوز جایزه تاییدشده‌ای ندارد'),
        ...rewards.take(8).map((r) => ListTile(leading: r['image_url'] != null ? Image.network(fullAssetUrl(r['image_url']), width: 38, height: 38, fit: BoxFit.cover) : const Icon(Icons.card_giftcard), title: Text(r['name'] ?? ''), subtitle: Text(r['status'] ?? ''))),
      ]))));
    },
  ));
}

class ProfilePage extends StatefulWidget { final ApiClient api; final Future<void> Function() reloadProfile; const ProfilePage({super.key, required this.api, required this.reloadProfile}); @override State<ProfilePage> createState() => _ProfilePageState(); }
class _ProfilePageState extends State<ProfilePage> {
  final first = TextEditingController(), last = TextEditingController(), nick = TextEditingController(), bank = TextEditingController(), age = TextEditingController(), city = TextEditingController(), province = TextEditingController();
  String selectedAvatar = avatarFiles.first;
  bool loaded=false; String? msg;
  @override void initState(){ super.initState(); load(); }
  Future<void> load() async { final d=await widget.api.get('/api/profile'); final u=Map<String,dynamic>.from(d['user']); first.text=u['first_name']??''; last.text=u['last_name']??''; nick.text=u['nickname']??''; bank.text=u['bank_account']??''; age.text='${u['age']??''}'; city.text=u['city']??''; province.text=u['province']??''; selectedAvatar=u['profile_avatar_key']??avatarFiles.first; setState(()=>loaded=true); }
  Future<void> save() async { try { await widget.api.patch('/api/profile', {'firstName':first.text,'lastName':last.text,'nickname':nick.text,'bankAccount':bank.text,'age':int.tryParse(age.text),'city':city.text,'province':province.text,'profileAvatarKey':selectedAvatar}); await widget.reloadProfile(); msg='پروفایل ذخیره شد'; } catch(e){ msg=apiError(e); } if(mounted)setState((){}); }
  @override Widget build(BuildContext c) => !loaded ? const Center(child:CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(18), children: [CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    const Text('تکمیل پروفایل خصوصی', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
    const Text('این اطلاعات فقط برای مدیر قابل مشاهده است؛ در چت فقط نام مستعار و عکس پروفایل دیده می‌شود.'),
    const SizedBox(height: 12), Center(child: AvatarImage(keyName: selectedAvatar, radius: 48)),
    Wrap(spacing: 8, runSpacing: 8, children: avatarFiles.map((a)=>GestureDetector(onTap:()=>setState(()=>selectedAvatar=a), child: Container(padding: const EdgeInsets.all(3), decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: selectedAvatar==a?Theme.of(c).colorScheme.primary:Colors.transparent, width: 3)), child: CircleAvatar(radius: 24, backgroundImage: AssetImage(avatarAsset(a)))))).toList()),
    TextField(controller:first, decoration: const InputDecoration(labelText:'نام')),
    TextField(controller:last, decoration: const InputDecoration(labelText:'نام خانوادگی')),
    TextField(controller:nick, decoration: const InputDecoration(labelText:'نام مستعار عمومی')),
    TextField(controller:age, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText:'سن')),
    TextField(controller:province, decoration: const InputDecoration(labelText:'استان')),
    TextField(controller:city, decoration: const InputDecoration(labelText:'محل زندگی / شهر')),
    TextField(controller:bank, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText:'شماره کارت بانکی / شبا')),
    const SizedBox(height: 12), FilledButton.icon(onPressed: save, icon: const Icon(Icons.save), label: const Text('ذخیره پروفایل')),
    if(msg!=null) Padding(padding: const EdgeInsets.only(top:8), child: Text(msg!)),
  ]))]);
}

// -------------------- Admin app inside Flutter --------------------
class AdminShell extends StatefulWidget {
  final ApiClient api;
  final VoidCallback onLogout;
  final bool dark;
  final VoidCallback onTheme;
  const AdminShell({super.key, required this.api, required this.onLogout, required this.dark, required this.onTheme});
  @override State<AdminShell> createState() => _AdminShellState();
}
class _AdminShellState extends State<AdminShell> {
  int idx = 0;
  late final pages = [AdminDashboard(api: widget.api), AdminCards(api: widget.api), AdminRewards(api: widget.api), AdminLeague(api: widget.api), AdminUsers(api: widget.api), AdminChat(api: widget.api), AdminSupport(api: widget.api), AdminNotifications(api: widget.api), AdminSettings(api: widget.api), AdminAdmins(api: widget.api)];
  final titles = ['داشبورد', 'کارت و کد', 'جوایز', 'لیگ', 'کاربران', 'چت', 'پشتیبانی', 'اطلاعیه‌ها', 'تنظیمات', 'ادمین‌ها'];
  final icons = [Icons.dashboard, Icons.credit_card, Icons.card_giftcard, Icons.emoji_events, Icons.people, Icons.chat, Icons.support_agent, Icons.notifications, Icons.settings, Icons.security];
  @override
  Widget build(BuildContext c) => Scaffold(
    appBar: AppBar(title: Text('مدیریت قلقلی — ${titles[idx]}'), actions: [IconButton(onPressed: widget.onTheme, icon: Icon(widget.dark ? Icons.light_mode : Icons.dark_mode)), IconButton(onPressed: widget.onLogout, icon: const Icon(Icons.logout))]),
    drawer: Drawer(child: SafeArea(child: ListView(padding: const EdgeInsets.all(12), children: [const HeroLogo(), const Divider(), ...List.generate(titles.length, (i) => ListTile(selected: idx == i, leading: Icon(icons[i]), title: Text(titles[i]), onTap: () { setState(() => idx = i); Navigator.pop(c); })), const Divider(), ListTile(leading: const Icon(Icons.logout), title: const Text('خروج'), onTap: widget.onLogout)]))),
    body: pages[idx],
  );
}
class AdminGuard extends StatelessWidget { final Future<dynamic> future; final Widget Function(dynamic data) builder; const AdminGuard({super.key, required this.future, required this.builder}); @override Widget build(BuildContext c) => FutureBuilder(future: future, builder: (c, s) { if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator()); if (s.hasError) return Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(apiError(s.error!)))); return builder(s.data); }); }
class StatCard extends StatelessWidget { final String title; final Object value; const StatCard(this.title, this.value, {super.key}); @override Widget build(BuildContext c) => CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title), const SizedBox(height: 6), Text(faNum(value), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900))])); }
class AdminDashboard extends StatefulWidget {
  final ApiClient api;
  const AdminDashboard({super.key, required this.api});
  @override State<AdminDashboard> createState() => _AdminDashboardState();
}
class _AdminDashboardState extends State<AdminDashboard> {
  late Future data = widget.api.get('/api/admin/dashboard');
  @override
  Widget build(BuildContext c) => RefreshIndicator(
    onRefresh: () async => setState(() => data = widget.api.get('/api/admin/dashboard')),
    child: AdminGuard(
      future: data,
      builder: (d) {
        final e = List<Map>.from(d['league']['entries'] ?? []);
        return ListView(padding: const EdgeInsets.all(16), children: [
          Wrap(spacing: 12, runSpacing: 12, children: [
            SizedBox(width: 170, child: StatCard('کاربران', d['users'])),
            SizedBox(width: 170, child: StatCard('کدهای امروز', d['usedCodesToday'])),
            SizedBox(width: 170, child: StatCard('کدهای ماه', d['usedCodesThisMonth'])),
            SizedBox(width: 170, child: StatCard('درخواست‌های در انتظار', d['pendingClaims'])),
          ]),
          const SizedBox(height: 16),
          CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('لیدربرد زنده', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
            ...e.map((r) => RankTile(rank: int.tryParse('${r['rank']}') ?? 0, row: r)),
          ])),
        ]);
      },
    ),
  );
}
class AdminCards extends StatefulWidget { final ApiClient api; const AdminCards({super.key, required this.api}); @override State<AdminCards> createState() => _AdminCardsState(); }
class _AdminCardsState extends State<AdminCards> { List types = [], codes = []; Map? report; String? selectedType; final name = TextEditingController(), point = TextEditingController(), desc = TextEditingController(), imageUrl = TextEditingController(), singleCode = TextEditingController(), bulkCodes = TextEditingController(); bool loading = false; @override void initState() { super.initState(); load(); } Future<void> load() async { types = await widget.api.get('/api/admin/card-types'); codes = await widget.api.get('/api/admin/card-codes'); selectedType ??= types.isNotEmpty ? types.first['id'] : null; if (mounted) setState(() {}); } Future<void> pickImage() async { final x = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 82); if (x != null) { imageUrl.text = await widget.api.uploadAdminImage(x.path); setState(() {}); } } Future<void> createType() async { setState(() => loading = true); try { await widget.api.post('/api/admin/card-types', {'name': name.text, 'pointValue': int.tryParse(point.text) ?? 0, 'description': desc.text, 'imageUrl': imageUrl.text}); name.clear(); point.clear(); desc.clear(); imageUrl.clear(); await load(); } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e)))); } finally { if (mounted) setState(() => loading = false); } } Future<void> editType(Map t) async { final n=TextEditingController(text:t['name']??''); final pts=TextEditingController(text:'${t['point_value']??0}'); final img=TextEditingController(text:t['image_url']??''); final ds=TextEditingController(text:t['description']??''); final ok=await showDialog<bool>(context: context,builder:(_)=>AlertDialog(title:const Text('ویرایش کارت'),content:SingleChildScrollView(child:Column(children:[TextField(controller:n,decoration:const InputDecoration(labelText:'نام کارت')),TextField(controller:pts,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'امتیاز')),TextField(controller:img,decoration:const InputDecoration(labelText:'عکس')),TextField(controller:ds,decoration:const InputDecoration(labelText:'توضیحات'))])),actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('لغو')),FilledButton(onPressed:()=>Navigator.pop(context,true),child:const Text('ذخیره'))])); if(ok==true){await widget.api.patch('/api/admin/card-types/${t['id']}', {'name':n.text,'pointValue':int.tryParse(pts.text)??0,'imageUrl':img.text,'description':ds.text}); await load();}} Future<void> addSingle() async { if (selectedType == null) return; await widget.api.post('/api/admin/card-codes', {'cardTypeId': selectedType, 'code': singleCode.text}); singleCode.clear(); await load(); } Future<void> addBulk() async { if (selectedType == null) return; final r = await widget.api.post('/api/admin/card-codes/bulk', {'cardTypeId': selectedType, 'rawCodes': bulkCodes.text}); report = Map.from(r); await load(); setState(() {}); }
  @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: [CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const Text('تعریف نوع کارت و عکس', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)), TextField(controller: name, decoration: const InputDecoration(labelText: 'نام کارت')), TextField(controller: point, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'امتیاز')), TextField(controller: desc, decoration: const InputDecoration(labelText: 'توضیحات')), Row(children: [Expanded(child: TextField(controller: imageUrl, decoration: const InputDecoration(labelText: 'آدرس عکس/آپلودشده'))), IconButton.filledTonal(onPressed: pickImage, icon: const Icon(Icons.photo_library))]), const SizedBox(height: 10), FilledButton(onPressed: loading ? null : createType, child: const Text('ذخیره کارت'))])), const SizedBox(height: 12), CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const Text('ثبت کد برای کارت', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)), DropdownButtonFormField(initialValue: selectedType, items: types.map<DropdownMenuItem<String>>((t) => DropdownMenuItem(value: t['id'], child: Text('${t['name']} — ${faNum(t['point_value'])}'))).toList(), onChanged: (v) => setState(() => selectedType = v)), TextField(controller: singleCode, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'ثبت تکی کد')), FilledButton.tonal(onPressed: addSingle, child: const Text('ثبت یک کد')), TextField(controller: bulkCodes, textCapitalization: TextCapitalization.characters, minLines: 5, maxLines: 10, decoration: const InputDecoration(labelText: 'ثبت دسته‌جمعی؛ هر خط یک کد یا جدا با کاما')), FilledButton(onPressed: addBulk, child: const Text('ثبت دسته‌جمعی کدها')), if (report != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text('موفق: ${faNum(report!['insertedCount'])} | تکراری فایل: ${faNum(report!['duplicateInFileCount'])} | تکراری دیتابیس: ${faNum(report!['duplicateInDbCount'])} | نامعتبر: ${faNum(report!['invalidCount'])}'))])), const SizedBox(height: 12), CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('نوع کارت‌ها'), ...types.take(20).map((t) => ListTile(leading: t['image_url'] != null && '${t['image_url']}'.isNotEmpty ? Image.network(fullAssetUrl(t['image_url']), width: 44, height: 44, fit: BoxFit.cover) : const Icon(Icons.credit_card), title: Text(t['name']), subtitle: Text('${faNum(t['point_value'])} امتیاز'), trailing: const Icon(Icons.edit), onTap:()=>editType(Map<String,dynamic>.from(t))))])), CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('آخرین کدها'), ...codes.take(40).map((x) => ListTile(title: Text(x['code'] ?? ''), subtitle: Text('${x['card_type_name']} — ${x['status']} — ${x['used_by_mobile'] ?? ''}')))]))]); }
class AdminRewards extends StatefulWidget { final ApiClient api; const AdminRewards({super.key, required this.api}); @override State<AdminRewards> createState() => _AdminRewardsState(); }
class _AdminRewardsState extends State<AdminRewards> {
  List rewards = [], claims = [];
  final name = TextEditingController(), points = TextEditingController(), value = TextEditingController(), desc = TextEditingController(), imageUrl = TextEditingController();
  String type = 'cash';
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { rewards = await widget.api.get('/api/admin/rewards'); claims = await widget.api.get('/api/admin/reward-claims'); if (mounted) setState(() {}); }
  Future<void> pickRewardImage() async { final x = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 82); if (x != null) { imageUrl.text = await widget.api.uploadAdminImage(x.path); if (mounted) setState(() {}); } }
  Future<void> add() async {
    if (rewards.length >= 30) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('حداکثر ۳۰ جایزه قابل تعریف است'))); return; }
    try {
      await widget.api.post('/api/admin/rewards', {'name': name.text, 'requiredPoints': int.tryParse(points.text) ?? 0, 'rewardType': type, 'rewardValue': value.text, 'description': desc.text, 'imageUrl': imageUrl.text, 'displayOrder': rewards.length + 1});
      name.clear(); points.clear(); value.clear(); desc.clear(); imageUrl.clear(); await load();
    } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e)))); }
  }
  Future<void> status(String id, String s) async { await widget.api.patch('/api/admin/reward-claims/$id', {'status': s}); await load(); }
  @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: [
    CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('جایزه جدید (${faNum(rewards.length)}/۳۰)', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
      TextField(controller: name, decoration: const InputDecoration(labelText: 'نام جایزه')),
      TextField(controller: points, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'امتیاز مورد نیاز')),
      Row(children: [Expanded(child: TextField(controller: imageUrl, decoration: const InputDecoration(labelText: 'عکس جایزه/آدرس آپلودشده'))), IconButton.filledTonal(onPressed: pickRewardImage, icon: const Icon(Icons.photo_library))]),
      DropdownButtonFormField(initialValue: type, items: const [DropdownMenuItem(value: 'cash', child: Text('نقدی')), DropdownMenuItem(value: 'physical', child: Text('فیزیکی'))], onChanged: (v) => setState(() => type = v!)),
      TextField(controller: value, decoration: const InputDecoration(labelText: 'مبلغ/توضیح جایزه')),
      TextField(controller: desc, decoration: const InputDecoration(labelText: 'توضیحات')),
      const SizedBox(height: 10),
      FilledButton(onPressed: rewards.length >= 30 ? null : add, child: const Text('ذخیره جایزه')),
    ])),
    const SizedBox(height: 12),
    CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('سطح‌های جایزه'),
      ...rewards.map((r) => ListTile(leading: r['image_url'] != null && '${r['image_url']}'.isNotEmpty ? Image.network(fullAssetUrl(r['image_url']), width: 48, height: 48, fit: BoxFit.cover) : const Icon(Icons.card_giftcard), title: Text(r['name']), subtitle: Text('${faNum(r['required_points'])} امتیاز — ${r['reward_value']}')))
    ])),
    CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('درخواست‌های جایزه'),
      ...claims.map((r) => ListTile(title: Text('${r['mobile']} — ${r['reward_name']}'), subtitle: Text(r['status']), trailing: PopupMenuButton<String>(onSelected: (s) => status(r['id'], s), itemBuilder: (_) => const [PopupMenuItem(value: 'approved', child: Text('تایید')), PopupMenuItem(value: 'paid', child: Text('پرداخت‌شده')), PopupMenuItem(value: 'rejected', child: Text('رد'))])))
    ]))
  ]);
}
class AdminLeague extends StatefulWidget { final ApiClient api; const AdminLeague({super.key, required this.api}); @override State<AdminLeague> createState() => _AdminLeagueState(); }
class _AdminLeagueState extends State<AdminLeague> { Map? d; List prizes = List.generate(10, (i) => {'rank': i + 1, 'amount': 0}); @override void initState() { super.initState(); load(); } Future<void> load() async { d = await widget.api.get('/api/admin/league'); prizes = List<Map>.from(d?['season']?['prize_table'] ?? prizes); setState(() {}); } Future<void> save() async { await widget.api.patch('/api/admin/league/current/prizes', {'prizeTable': prizes}); await load(); }
  @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: [CardShell(child: Column(children: [const Text('جوایز رتبه‌ها'), ...List.generate(prizes.length, (i) => TextFormField(initialValue: '${prizes[i]['amount']}', keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'رتبه ${faNum(prizes[i]['rank'])}'), onChanged: (v) => prizes[i]['amount'] = int.tryParse(v) ?? 0)), FilledButton(onPressed: save, child: const Text('ذخیره جوایز لیگ'))])), const SizedBox(height: 12), CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('لیدربرد'), ...List<Map>.from(d?['entries'] ?? []).map((r) => RankTile(rank: int.tryParse('${r['rank']}') ?? 0, row: r))]))]); }
class AdminUsers extends StatefulWidget { final ApiClient api; const AdminUsers({super.key, required this.api}); @override State<AdminUsers> createState() => _AdminUsersState(); }
class _AdminUsersState extends State<AdminUsers> { List rows = []; final q = TextEditingController(); @override void initState() { super.initState(); load(); } Future<void> load() async { rows = await widget.api.get('/api/admin/users?search=${Uri.encodeComponent(q.text)}'); setState(() {}); } Future<void> points(String id) async { final c = TextEditingController(); final p = await showDialog<String>(context: context, builder: (_) => AlertDialog(title: const Text('امتیاز دستی'), content: TextField(controller: c, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'مثبت یا منفی')), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('لغو')), FilledButton(onPressed: () => Navigator.pop(context, c.text), child: const Text('ثبت'))])); if (p != null) { await widget.api.post('/api/admin/users/$id/points', {'points': int.tryParse(p) ?? 0, 'reason': 'تغییر از اپ مدیریت'}); await load(); } } Future<void> details(String id) async { final d=await widget.api.get('/api/admin/users/$id'); final u=Map<String,dynamic>.from(d['user']); if(!mounted)return; showDialog(context:context,builder:(_)=>AlertDialog(title:Text(u['nickname']??u['mobile']??'کاربر'),content:SingleChildScrollView(child:Column(crossAxisAlignment:CrossAxisAlignment.start,mainAxisSize:MainAxisSize.min,children:[Text('موبایل/نام کاربری: ${u['mobile']??''}'),Text('نام: ${u['first_name']??''}'),Text('نام خانوادگی: ${u['last_name']??''}'),Text('سن: ${u['age']??''}'),Text('استان: ${u['province']??''}'),Text('محل زندگی: ${u['city']??''}'),Text('شماره کارت/شبا: ${u['bank_account']??''}'),Text('امتیاز فعلی: ${faNum(u['current_points'])}'),Text('امتیاز تاریخی: ${faNum(u['lifetime_points'])}')])) ,actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('بستن'))])); }
  @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: [CardShell(child: Row(children: [Expanded(child: TextField(controller: q, decoration: const InputDecoration(labelText: 'جستجوی کاربر'))), IconButton.filled(onPressed: load, icon: const Icon(Icons.search))])), ...rows.map((u) => Card(child: ListTile(onTap:()=>details(u['id']), title: Text('${u['mobile']} — ${u['nickname'] ?? ''}'), subtitle: Text('${faNum(u['current_points'])} امتیاز — ${u['status']}'), trailing: PopupMenuButton<String>(onSelected: (s) async { if (s == 'points') await points(u['id']); else { await widget.api.patch('/api/admin/users/${u['id']}/status', {'status': s, 'reason': 'از اپ مدیریت'}); await load(); } }, itemBuilder: (_) => [const PopupMenuItem(value: 'points', child: Text('تغییر امتیاز')), PopupMenuItem(value: u['status'] == 'active' ? 'blocked' : 'active', child: Text(u['status'] == 'active' ? 'مسدود' : 'رفع مسدودی'))]))))]); }
class AdminChat extends StatefulWidget { final ApiClient api; const AdminChat({super.key, required this.api}); @override State<AdminChat> createState() => _AdminChatState(); }
class _AdminChatState extends State<AdminChat> { List rows = []; @override void initState() { super.initState(); load(); } Future<void> load() async { rows = await widget.api.get('/api/admin/chat/messages'); setState(() {}); } @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: rows.map((m) => Card(child: ListTile(title: Text(m['nickname'] ?? m['mobile'] ?? ''), subtitle: Text(m['message_text'] ?? ''), trailing: PopupMenuButton<String>(onSelected: (s) async { if (s == 'delete') await widget.api.patch('/api/admin/chat/messages/${m['id']}/delete', {'reason': 'از اپ مدیریت'}); if (s == 'ban') await widget.api.patch('/api/admin/chat/users/${m['user_id']}/ban', {'minutes': 1440, 'reason': 'از اپ مدیریت'}); await load(); }, itemBuilder: (_) => const [PopupMenuItem(value: 'delete', child: Text('حذف پیام')), PopupMenuItem(value: 'ban', child: Text('بن چت ۲۴ ساعت'))])))).toList()); }
class AdminSupport extends StatefulWidget { final ApiClient api; const AdminSupport({super.key, required this.api}); @override State<AdminSupport> createState() => _AdminSupportState(); }
class _AdminSupportState extends State<AdminSupport> { List tickets = [], msgs = []; Map? sel; final reply = TextEditingController(); @override void initState() { super.initState(); load(); } Future<void> load() async { tickets = await widget.api.get('/api/admin/support/tickets'); setState(() {}); } Future<void> open(Map t) async { sel = t; msgs = await widget.api.get('/api/admin/support/tickets/${t['id']}/messages'); setState(() {}); } Future<void> send() async { if (sel == null) return; await widget.api.post('/api/admin/support/tickets/${sel!['id']}/messages', {'message': reply.text}); reply.clear(); await open(sel!); await load(); }
  @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: [CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('تیکت‌ها'), ...tickets.map((t) => ListTile(selected: sel?['id'] == t['id'], title: Text('${t['mobile']} — ${t['subject']}'), subtitle: Text(t['status']), onTap: () => open(Map.from(t))))])), if (sel != null) CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text('پاسخ به: ${sel!['subject']}', style: const TextStyle(fontWeight: FontWeight.w900)), ...msgs.map((m) => Align(alignment: m['sender_type'] == 'admin' ? Alignment.centerLeft : Alignment.centerRight, child: Container(margin: const EdgeInsets.all(6), padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: m['sender_type'] == 'admin' ? Colors.teal.withValues(alpha: .25) : Colors.blueGrey.withValues(alpha: .25), borderRadius: BorderRadius.circular(14)), child: Text(m['message_text'])))), TextField(controller: reply, maxLines: 3, decoration: const InputDecoration(labelText: 'پاسخ')), FilledButton(onPressed: send, child: const Text('ارسال پاسخ'))]))]); }
class AdminNotifications extends StatefulWidget { final ApiClient api; const AdminNotifications({super.key, required this.api}); @override State<AdminNotifications> createState() => _AdminNotificationsState(); }
class _AdminNotificationsState extends State<AdminNotifications> { final title = TextEditingController(), body = TextEditingController(); @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: [CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const Text('ارسال اطلاعیه همگانی'), TextField(controller: title, decoration: const InputDecoration(labelText: 'عنوان')), TextField(controller: body, maxLines: 5, decoration: const InputDecoration(labelText: 'متن')), FilledButton(onPressed: () async { await widget.api.post('/api/admin/notifications/broadcast', {'title': title.text, 'body': body.text}); title.clear(); body.clear(); if (mounted) ScaffoldMessenger.of(c).showSnackBar(const SnackBar(content: Text('اطلاعیه ارسال شد'))); }, child: const Text('ارسال'))]))]); }
class AdminSettings extends StatefulWidget { final ApiClient api; const AdminSettings({super.key, required this.api}); @override State<AdminSettings> createState() => _AdminSettingsState(); }
class _AdminSettingsState extends State<AdminSettings> {
  final chatMin = TextEditingController(); final cooldown = TextEditingController(); final badWords = TextEditingController();
  final provider = TextEditingController(); final sender = TextEditingController(); final apiKey = TextEditingController(); final pattern = TextEditingController();
  bool smsEnabled=false, smsTest=true; String? msg;
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { final c = await widget.api.get('/api/admin/settings/chat'); chatMin.text = '${c['minLifetimePoints'] ?? 0}'; cooldown.text='${c['messageCooldownSeconds'] ?? 5}'; badWords.text = ((c['badWords'] as List?) ?? []).join('\n'); final s=await widget.api.get('/api/admin/settings/sms'); provider.text=s['provider']??''; sender.text=s['sender']??''; apiKey.text=s['apiKeyMasked']??''; pattern.text=s['patternCode']??''; smsEnabled=s['enabled']==true; smsTest=s['testMode']!=false; if (mounted) setState(() {}); }
  Future<void> saveChat() async { try { final r = await widget.api.patch('/api/admin/settings/chat', {'minLifetimePoints': int.tryParse(chatMin.text) ?? 0, 'messageCooldownSeconds': int.tryParse(cooldown.text) ?? 5, 'badWordsText': badWords.text, 'reason': 'تنظیم از اپ مدیریت'}); msg = r['message'] ?? 'ذخیره شد'; } catch (e) { msg = apiError(e); } if (mounted) setState(() {}); }
  Future<void> saveSms() async { try { final r = await widget.api.patch('/api/admin/settings/sms', {'provider':provider.text,'sender':sender.text,'apiKey':apiKey.text,'patternCode':pattern.text,'enabled':smsEnabled,'testMode':smsTest}); msg = r['message'] ?? 'ذخیره شد'; } catch (e) { msg = apiError(e); } if (mounted) setState(() {}); }
  @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: [
    CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const Text('تنظیمات چت کاربران', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)), const Text('حداقل امتیاز و فاصله زمانی بین پیام‌ها برای جلوگیری از اسپم.'), TextField(controller: chatMin, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'حداقل امتیاز تاریخی برای چت')), TextField(controller: cooldown, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'فاصله بین پیام‌ها - ثانیه')), TextField(controller: badWords, minLines: 3, maxLines: 6, decoration: const InputDecoration(labelText: 'کلمات رکیک/ممنوعه؛ هر خط یک کلمه')), FilledButton.icon(onPressed: saveChat, icon: const Icon(Icons.save), label: const Text('ذخیره تنظیمات چت'))])),
    const SizedBox(height: 12),
    CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const Text('تنظیمات پنل SMS', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)), TextField(controller: provider, decoration: const InputDecoration(labelText: 'نام سرویس‌دهنده')), TextField(controller: sender, decoration: const InputDecoration(labelText: 'فرستنده')), TextField(controller: apiKey, decoration: const InputDecoration(labelText: 'API Key')), TextField(controller: pattern, decoration: const InputDecoration(labelText: 'کد پترن/قالب')), SwitchListTile(value: smsEnabled, onChanged: (v)=>setState(()=>smsEnabled=v), title: const Text('فعال‌سازی SMS')), SwitchListTile(value: smsTest, onChanged: (v)=>setState(()=>smsTest=v), title: const Text('حالت تست')), FilledButton.icon(onPressed: saveSms, icon: const Icon(Icons.sms), label: const Text('ذخیره SMS'))])),
    if (msg != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(msg!))
  ]); }
class AdminAdmins extends StatefulWidget { final ApiClient api; const AdminAdmins({super.key, required this.api}); @override State<AdminAdmins> createState() => _AdminAdminsState(); }
class _AdminAdminsState extends State<AdminAdmins> { List admins = [], logs = []; final u = TextEditingController(), p = TextEditingController(); String role = 'support'; @override void initState() { super.initState(); load(); } Future<void> load() async { admins = await widget.api.get('/api/admin/admins'); logs = await widget.api.get('/api/admin/audit-log'); setState(() {}); } Future<void> add() async { await widget.api.post('/api/admin/admins', {'username': u.text, 'password': p.text, 'role': role}); u.clear(); p.clear(); await load(); }
  @override Widget build(BuildContext c) => ListView(padding: const EdgeInsets.all(16), children: [CardShell(child: Column(children: [const Text('ادمین جدید'), TextField(controller: u, decoration: const InputDecoration(labelText: 'نام کاربری')), TextField(controller: p, decoration: const InputDecoration(labelText: 'رمز عبور')), DropdownButtonFormField(initialValue: role, items: const [DropdownMenuItem(value: 'super_admin', child: Text('مدیر کل')), DropdownMenuItem(value: 'support', child: Text('پشتیبان')), DropdownMenuItem(value: 'observer', child: Text('ناظر'))], onChanged: (v) => setState(() => role = v!),), FilledButton(onPressed: add, child: const Text('ایجاد ادمین'))])), CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('ادمین‌ها'), ...admins.map((a) => ListTile(title: Text(a['username']), subtitle: Text(a['role'])))])), CardShell(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('Audit Log'), ...logs.take(80).map((l) => Text('${l['username'] ?? 'سیستم'} — ${l['action']} — ${l['created_at']}'))]))]); }

String todayJalali() { final j = Jalali.now(); return '${faNum(j.year)}/${faNum(j.month)}/${faNum(j.day)}'; }
