import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { useLocation, Navigate, useNavigate, Link } from 'react-router-dom';
import { Building2, Package, Boxes, AlertTriangle, ClipboardList, Truck, Pencil, KeyRound, Trash2, ArrowLeft, ArrowRight, PackageX, PackageMinus, ShieldAlert, Scale, GraduationCap, Users, FileDown } from 'lucide-react';
import api from '../utils/api';
import toast from '../utils/toast';
import * as XLSX from 'xlsx';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import IconActionButton from '../components/ui/IconActionButton';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import SkeletonLoader from '../components/ui/SkeletonLoader';
import AuditReportDetails from '../components/AuditReportDetails';
import AuditHistoryList from '../components/shared/AuditHistoryList';
import PageHeader from '../components/layout/PageHeader';
import { formatAuditMonthLabel } from '../utils/auditMonth';
import StatCard from '../components/admin/StatCard';
import LifecycleStrip from '../components/admin/LifecycleStrip';
import ModuleQuickLink from '../components/admin/ModuleQuickLink';
import AdminKitManager from '../components/admin/AdminKitManager';
import AdminAccountManagers from '../components/admin/AdminAccountManagers';
import AdminReportsSection from '../components/admin/AdminReportsSection';
import AdminOperationsBoard from '../components/admin/AdminOperationsBoard';
import AttentionQueues from '../components/admin/AttentionQueues';
import AdminDispatchModal, { emptyDispatchForm, hasDuplicateKitTypes } from '../components/admin/AdminDispatchModal';
import AdminAuthorizeReplacementModal from '../components/admin/AdminAuthorizeReplacementModal';
import AdminAuditReviewModal from '../components/admin/AdminAuditReviewModal';
import AdminSchoolDispatchHub from '../components/admin/AdminSchoolDispatchHub';
import AdminAuditScheduler from '../components/admin/AdminAuditScheduler';
import {
  AdminAuditReviewTable,
  AdminAuditReplacementList,
} from '../components/admin/AdminAuditSections';
import { auditHasUndispatchedLines, countAuditLines } from '../utils/auditApprovals';
import {
  AmApprovalSection,
  AmApprovalTile,
  AdminReceiptIssueTable,
  AdminReplacementRequestTable,
} from '../components/admin/AdminReplacementSections';
import { ROUTES } from '../utils/routes';
import {
  getAdminActiveView,
  computeAdminMetrics,
  ADMIN_HEADER_COPY,
} from '../utils/adminMetrics';
import { formatSchoolDisplayName, normalizeBranchName } from '../utils/schoolName';
import { preserveSchoolLoginId } from '../utils/schoolCode';
import { formatSchoolIdentityPrefix } from '../utils/componentId';
import SchoolIdentityEditor from '../components/admin/SchoolIdentityEditor';
import { isReplacementInTransit } from '../utils/schoolDispatch';
import Pagination from '../components/shared/Pagination';
import ListToolbar from '../components/shared/ListToolbar';
import { usePaginatedList, fetchAllPages } from '../hooks/usePaginatedList';

const WIZKLUB_PAGE_SIZE = 25;
import { useAdminApprovalCounts } from '../context/AdminApprovalCountsContext';
import { AuthContext } from '../context/AuthContext';
import { DispatchIdCell, KitDetailsCell, QuantityCell } from '../components/shared/DispatchRedispatchCells';
import DispatchTrackingModal from '../components/shared/DispatchTrackingModal';
import AdminEditTrackingModal from '../components/admin/AdminEditTrackingModal';
import { canAdminEditTracking, getDispatchTrackingValue, isTrackingOverdue } from '../utils/dispatchTracking';
import { filterProductionDivisions } from '../utils/testData';

const REPLACEMENT_CATEGORY_PATHS = {
  missing: ROUTES.admin.replacementsMissing,
  lost: ROUTES.admin.replacementsLost,
  damaged: ROUTES.admin.replacementsDamaged,
  mismatch: ROUTES.admin.replacementsMismatch,
};

const REPLACEMENT_PAGE_SIZE = 10;

function filterReplacementItems(items, search) {
  const q = search.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const school = formatSchoolDisplayName(item.school?.name || '').toLowerCase();
    const kit = (item.kit?.name || '').toLowerCase();
    const dispatchRef = (item.sourceDispatchRef || item.dispatch?.dispatchId || '').toLowerCase();
    const details = (item.reasonDetails || item.damageDescription || item.remarks || '').toLowerCase();
    return school.includes(q) || kit.includes(q) || dispatchRef.includes(q) || details.includes(q);
  });
}

const AdminDashboard = () => {
  const { user } = useContext(AuthContext);
  const adminDisplayName = user?.name || user?.username || 'Admin';
  const [data, setData] = useState({
    requests: [],
    receiptIssues: [],
    kits: [],
    ams: [],
    divisions: [],
    auditWindows: [],
    warehouseTotal: 0,
    schoolCount: 0,
  });
  const [stats, setStats] = useState(null);
  const [divisionSummary, setDivisionSummary] = useState({
    schoolCountByDivision: {},
    divisionDispatchCounts: {},
  });
  const [resolvedDispatchSchool, setResolvedDispatchSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schoolDivisionFilter, setSchoolDivisionFilter] = useState('');
  const [auditStatusFilter, setAuditStatusFilter] = useState('All');
  const [auditMonthFilter, setAuditMonthFilter] = useState('');
  const [auditWorkflowFilter, setAuditWorkflowFilter] = useState('All');
  const [auditSchoolFilter, setAuditSchoolFilter] = useState('');
  const [auditSchoolOptions, setAuditSchoolOptions] = useState([]);
  const [schoolAudits, setSchoolAudits] = useState([]);
  const [schoolAuditsLoading, setSchoolAuditsLoading] = useState(false);
  const [replacementSearch, setReplacementSearch] = useState('');
  const [replacementPage, setReplacementPage] = useState(1);
  const [pendingAdminAudits, setPendingAdminAudits] = useState([]);
  const [approvedAuditsForDispatch, setApprovedAuditsForDispatch] = useState([]);
  const [auditModalReadOnly, setAuditModalReadOnly] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { setCounts: setAdminApprovalCounts } = useAdminApprovalCounts();

  const activeView = useMemo(() => getAdminActiveView(location.pathname), [location.pathname]);

  const productionDivisions = useMemo(
    () => filterProductionDivisions(data.divisions),
    [data.divisions],
  );

  const replacementCategory = useMemo(() => {
    const path = location.pathname;
    if (path === ROUTES.admin.replacementsMissing || path.endsWith('/replacements/missing')) return 'missing';
    if (path === ROUTES.admin.replacementsLost || path.endsWith('/replacements/lost')) return 'lost';
    if (path === ROUTES.admin.replacementsDamaged || path.endsWith('/replacements/damaged')) return 'damaged';
    if (path === ROUTES.admin.replacementsMismatch || path.endsWith('/replacements/mismatch')) return 'mismatch';
    return null;
  }, [location.pathname]);

  const isReplacementGrid = activeView === 'replacements' && replacementCategory === null;
  const isReplacementDetail = activeView === 'replacements' && replacementCategory !== null;

  const dispatchNav = useMemo(() => {
    const prefix = ROUTES.admin.dispatches;
    if (!location.pathname.startsWith(prefix)) return { step: 'divisions' };
    const tail = location.pathname.slice(prefix.length).replace(/^\//, '');
    if (!tail) return { step: 'divisions' };
    const [divisionId, schoolId] = tail.split('/').filter(Boolean);
    if (schoolId) return { step: 'school', divisionId, schoolId };
    if (divisionId) return { step: 'schools', divisionId };
    return { step: 'divisions' };
  }, [location.pathname]);

  const metrics = useMemo(() => computeAdminMetrics(data, stats), [data, stats]);

  // Operational Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReplacementDispatchModalOpen, setIsReplacementDispatchModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isKitStatusModalOpen, setIsKitStatusModalOpen] = useState(false);
  const [isReplacementsModalOpen, setIsReplacementsModalOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState(null);

  // Entity Management Modals
  const [isDivisionModalOpen, setIsDivisionModalOpen] = useState(false);
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);

  // Forms
  const [dispatchForm, setDispatchForm] = useState(emptyDispatchForm());
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [replacementDispatchForm, setReplacementDispatchForm] = useState({ requestId: '', replacementId: '', school: '', schoolName: '', kit: '', category: 'Lost Dispatch', quantity: 1, reportingManager: '', dispatchDetails: '', kitId: '', adminNotes: '' });
  const [receiptIssueModal, setReceiptIssueModal] = useState(null);
  const [trackingDispatch, setTrackingDispatch] = useState(null);
  const [editTrackingDispatch, setEditTrackingDispatch] = useState(null);
  const [trackingSubmitting, setTrackingSubmitting] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [receiptIssueForm, setReceiptIssueForm] = useState({ consignmentNo: '', adminNotes: '' });
  
  // Entity Forms
  const [divisionForm, setDivisionForm] = useState({
    id: null, name: '', description: '',
  });
  const [generatedPassword, setGeneratedPassword] = useState(null);
  const [passwordMeta, setPasswordMeta] = useState({
    emailSent: false,
    emailNote: null,
    entityName: '',
    credentialType: 'am',
    schoolCode: '',
    email: '',
  });
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [schoolForm, setSchoolForm] = useState({
    id: null, name: '', code: '', joiningYear: '', divisionId: '', contactEmail: '',
    wizklubSchoolId: '', wizklubRegionId: null, wizklubRegionName: '',
  });
  const [wizklubSchoolOptions, setWizklubSchoolOptions] = useState([]);
  const [wizklubSchoolsLoading, setWizklubSchoolsLoading] = useState(false);
  const [wizklubStats, setWizklubStats] = useState({
    total: 0, withRegionCount: 0, needsRegionCount: 0, readyToRegisterCount: 0,
    mappedCount: 0, notMappedCount: 0, pendingRegisterCount: 0,
  });
  const [wizklubMappedItems, setWizklubMappedItems] = useState([]);
  const [wizklubNotMappedItems, setWizklubNotMappedItems] = useState([]);
  const [wizklubMappedTotal, setWizklubMappedTotal] = useState(0);
  const [wizklubNotMappedTotal, setWizklubNotMappedTotal] = useState(0);
  const [wizklubMappedTotalPages, setWizklubMappedTotalPages] = useState(1);
  const [wizklubNotMappedTotalPages, setWizklubNotMappedTotalPages] = useState(1);
  const [operationalListStats, setOperationalListStats] = useState(null);
  const [wizklubSyncLoading, setWizklubSyncLoading] = useState(false);
  const [wizklubAmSyncLoading, setWizklubAmSyncLoading] = useState(false);
  const [wizklubAmSyncReport, setWizklubAmSyncReport] = useState(null);
  const [wizklubBulkLoading, setWizklubBulkLoading] = useState(false);
  const [wizklubBulkReport, setWizklubBulkReport] = useState(null);
  const [wizklubRegionMappings, setWizklubRegionMappings] = useState([]);
  const [manualDivisionBySchool, setManualDivisionBySchool] = useState({});
  const [selectedWizklubSchoolKey, setSelectedWizklubSchoolKey] = useState('');
  const [schoolRegistryTab, setSchoolRegistryTab] = useState('registered');
  const [wizklubCatalogSearch, setWizklubCatalogSearch] = useState('');
  const [debouncedWizklubSearch, setDebouncedWizklubSearch] = useState('');
  const [wizklubListFilter, setWizklubListFilter] = useState('all');
  const [wizklubMappedPage, setWizklubMappedPage] = useState(1);
  const [wizklubNotMappedPage, setWizklubNotMappedPage] = useState(1);
  const [opsData, setOpsData] = useState(null);
  const [opsLoading, setOpsLoading] = useState(true);
  const [receiptIssueMode, setReceiptIssueMode] = useState('approve');

  const fetchData = async () => {
    try {
      setLoading(true);
      setOpsLoading(true);
      const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const [bootstrapRes, statsRes, summaryRes, opsRes] = await Promise.allSettled([
        api.get('/admin/bootstrap'),
        api.get('/admin/dashboard'),
        api.get('/admin/dispatch-division-summary'),
        api.get('/admin/operations', { params: { month } }),
      ]);

      if (bootstrapRes.status === 'fulfilled') {
        const res = bootstrapRes.value;
        setData({
          requests: res.data.requests || [],
          receiptIssues: res.data.receiptIssues || [],
          kits: res.data.kits || [],
          ams: res.data.ams || [],
          divisions: res.data.divisions || [],
          auditWindows: res.data.auditWindows || [],
          warehouseTotal: res.data.warehouseTotal || 0,
          schoolCount: res.data.schoolCount || 0,
        });
      } else {
        console.error(bootstrapRes.reason);
        toast.error('Failed to load admin data');
      }

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data.data);
      } else {
        console.error(statsRes.reason);
      }

      if (summaryRes.status === 'fulfilled') {
        setDivisionSummary(summaryRes.value.data);
      }

      if (opsRes.status === 'fulfilled') {
        setOpsData(opsRes.value.data || null);
      } else {
        setOpsData(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setOpsLoading(false);
    }
  };

  const schoolsRegistry = usePaginatedList('/admin/schools', {
    enabled: activeView === 'schools',
    params: schoolDivisionFilter ? { divisionId: schoolDivisionFilter } : {},
  });

  const divisionSchoolsList = usePaginatedList('/admin/schools', {
    enabled: activeView === 'dispatches' && dispatchNav.step === 'schools' && !!dispatchNav.divisionId,
    params: { divisionId: dispatchNav.divisionId || '' },
  });

  const reportsDispatches = usePaginatedList('/admin/dispatches', {
    enabled: activeView === 'reports',
  });

  const auditsList = usePaginatedList('/admin/audits', {
    enabled: activeView === 'auditSubmissions',
    params: {
      ...(auditStatusFilter !== 'All' ? { status: auditStatusFilter } : {}),
      ...(auditMonthFilter ? { month: auditMonthFilter } : {}),
      ...(auditWorkflowFilter !== 'All' ? { workflowStatus: auditWorkflowFilter } : {}),
      ...(auditSchoolFilter ? { schoolId: auditSchoolFilter } : {}),
    },
  });

  useEffect(() => {
    if (activeView !== 'auditSubmissions') return undefined;
    let cancelled = false;
    fetchAllPages('/admin/schools')
      .then((schools) => {
        if (!cancelled) setAuditSchoolOptions(schools);
      })
      .catch(() => {
        if (!cancelled) setAuditSchoolOptions([]);
      });
    return () => { cancelled = true; };
  }, [activeView]);

  const applyWizklubStats = useCallback((payload) => {
    setWizklubStats({
      total: payload.total || 0,
      withRegionCount: payload.withRegionCount || 0,
      needsRegionCount: payload.needsRegionCount || 0,
      readyToRegisterCount: payload.readyToRegisterCount || 0,
      mappedCount: payload.mappedCount || 0,
      notMappedCount: payload.notMappedCount || 0,
      pendingRegisterCount: payload.pendingRegisterCount ?? payload.readyToRegisterCount ?? 0,
    });
    if (payload.operationalList) {
      setOperationalListStats(payload.operationalList);
    }
  }, []);

  const wizklubMappedPendingCount = wizklubStats.pendingRegisterCount ?? 0;

  const loadAuditActionAudits = async () => {
    try {
      const [pending, approved] = await Promise.all([
        fetchAllPages('/admin/audits', { workflowStatus: 'Pending Admin Approval' }),
        fetchAllPages('/admin/audits', { workflowStatus: 'Approved' }),
      ]);
      setPendingAdminAudits(pending);
      setApprovedAuditsForDispatch(approved.filter(auditHasUndispatchedLines));
    } catch (err) {
      console.error(err);
    }
  };

  const refreshAllLists = () => {
    schoolsRegistry.refresh();
    divisionSchoolsList.refresh();
    reportsDispatches.refresh();
    auditsList.refresh();
  };

  const afterMutation = async () => {
    await fetchData();
    await loadAuditActionAudits();
    refreshAllLists();
  };

  useEffect(() => {
    fetchData();
    loadAuditActionAudits();
  }, []);

  const pendingAdminReceiptIssues = useMemo(
    () => (data.receiptIssues || []).filter((i) => i.status === 'Pending Admin Approval'),
    [data.receiptIssues]
  );
  const actionableReceiptIssues = useMemo(
    () => (data.receiptIssues || []).filter((i) => {
      if (i.status === 'Pending Admin Approval') return true;
      if (i.status === 'Approved' && !isReplacementInTransit(i)) return true;
      return false;
    }),
    [data.receiptIssues]
  );

  const quantityMismatchIssues = useMemo(
    () => actionableReceiptIssues.filter((i) => i.issueType === 'Quantity Mismatch'),
    [actionableReceiptIssues],
  );
  const missingProductIssues = useMemo(
    () => actionableReceiptIssues.filter((i) => i.issueType === 'Missing Product' || i.issueType === 'Shipment Not Received'),
    [actionableReceiptIssues],
  );
  const damagedProductIssues = useMemo(
    () => actionableReceiptIssues.filter((i) => i.issueType === 'Damaged Product'),
    [actionableReceiptIssues],
  );
  const missingApprovalCount = missingProductIssues.length + data.requests.length;
  const pendingAuditLostReviewCount = countAuditLines(pendingAdminAudits, 'lost', { amStatus: 'Approved' });
  const pendingAuditLostDispatchCount = countAuditLines(approvedAuditsForDispatch, 'lost', {
    undispatchedOnly: true,
    amStatus: 'Approved',
  });
  const lostApprovalCount = pendingAuditLostReviewCount + pendingAuditLostDispatchCount;
  const pendingAuditDamagedReviewCount = countAuditLines(pendingAdminAudits, 'damaged', { amStatus: 'Approved' });
  const pendingAuditDamagedDispatchCount = countAuditLines(approvedAuditsForDispatch, 'damaged', {
    undispatchedOnly: true,
    amStatus: 'Approved',
  });
  const damagedApprovalCount = damagedProductIssues.length + pendingAuditDamagedReviewCount + pendingAuditDamagedDispatchCount;
  const totalAdminReplacements = missingApprovalCount + lostApprovalCount + damagedApprovalCount + quantityMismatchIssues.length;

  useEffect(() => {
    setAdminApprovalCounts({
      total: totalAdminReplacements,
      receiptIssues: pendingAdminReceiptIssues.length,
      replacements: data.requests.length,
      auditReview: pendingAdminAudits.length + approvedAuditsForDispatch.length,
      missingProduct: missingApprovalCount,
      lostProduct: lostApprovalCount,
      damagedProduct: damagedApprovalCount,
      quantityMismatch: quantityMismatchIssues.length,
    });
  }, [
    totalAdminReplacements,
    pendingAdminReceiptIssues.length,
    data.requests.length,
    pendingAdminAudits.length,
    approvedAuditsForDispatch.length,
    missingApprovalCount,
    lostApprovalCount,
    damagedApprovalCount,
    quantityMismatchIssues.length,
    setAdminApprovalCounts,
  ]);

  const openAuditReview = (audit, readOnly = false) => {
    setAuditModalReadOnly(readOnly);
    setSelectedAudit(audit);
  };

  const selectedDispatchDivision = useMemo(
    () => (dispatchNav.divisionId ? data.divisions.find((d) => d._id === dispatchNav.divisionId) : null),
    [dispatchNav.divisionId, data.divisions],
  );

  const selectedDispatchSchool = resolvedDispatchSchool;

  useEffect(() => {
    if (dispatchNav.step !== 'school' || !dispatchNav.schoolId) {
      setResolvedDispatchSchool(null);
      return;
    }
    const fromList = divisionSchoolsList.items.find((s) => s._id === dispatchNav.schoolId);
    if (fromList) {
      setResolvedDispatchSchool(fromList);
      return;
    }
    api.get('/admin/schools', { params: { id: dispatchNav.schoolId, limit: 1 } })
      .then((res) => setResolvedDispatchSchool(res.data.data?.[0] || null))
      .catch(() => setResolvedDispatchSchool(null));
  }, [dispatchNav.step, dispatchNav.schoolId, divisionSchoolsList.items]);

  const schoolCountByDivision = divisionSummary.schoolCountByDivision || {};
  const dispatchCountByDivision = divisionSummary.divisionDispatchCounts || {};

  const replacementIssuesForCategory = useMemo(() => {
    if (replacementCategory === 'missing') return missingProductIssues;
    if (replacementCategory === 'damaged') return damagedProductIssues;
    if (replacementCategory === 'mismatch') return quantityMismatchIssues;
    return [];
  }, [replacementCategory, missingProductIssues, damagedProductIssues, quantityMismatchIssues]);

  const filteredReplacementIssues = useMemo(
    () => filterReplacementItems(replacementIssuesForCategory, replacementSearch),
    [replacementIssuesForCategory, replacementSearch],
  );

  const filteredReplacementRequests = useMemo(
    () => (replacementCategory === 'missing' ? filterReplacementItems(data.requests, replacementSearch) : []),
    [replacementCategory, data.requests, replacementSearch],
  );

  const replacementListTotal = filteredReplacementIssues.length
    + (replacementCategory === 'missing' ? filteredReplacementRequests.length : 0);
  const replacementTotalPages = Math.max(1, Math.ceil(replacementListTotal / REPLACEMENT_PAGE_SIZE));
  const replacementPageSafe = Math.min(replacementPage, replacementTotalPages);

  useEffect(() => {
    setReplacementPage(1);
  }, [replacementSearch, replacementCategory]);

  const handleReceiptIssueAction = async (issueId, action) => {
    if (action === 'approve') return;
    const result = await toast.approvalNotes({ action: 'reject', kind: 'admin-receipt' });
    if (!result.confirmed) return;
    try {
      await api.put(`/admin/receipt-issue/${issueId}/reject`, { adminNotes: result.notes });
      toast.success('Receipt issue rejected.');
      afterMutation();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject issue');
    }
  };

  const openReceiptIssueApprove = (issue) => {
    setReceiptIssueMode('approve');
    setReceiptIssueModal(issue);
    setReceiptIssueForm({ consignmentNo: '', adminNotes: '' });
  };

  const openReceiptIssueShip = (issue) => {
    setReceiptIssueMode('ship');
    setReceiptIssueModal(issue);
    setReceiptIssueForm({ consignmentNo: '', adminNotes: '' });
  };

  const submitReceiptIssueApprove = async (e) => {
    e.preventDefault();
    if (!receiptIssueModal) return;
    if (receiptIssueMode === 'ship' && !String(receiptIssueForm.consignmentNo || '').trim()) {
      toast.error('Tracking ID is required to ship a replacement');
      return;
    }
    try {
      if (receiptIssueMode === 'ship') {
        await api.put(`/admin/receipt-issue/${receiptIssueModal._id}/ship`, receiptIssueForm);
        toast.success('Replacement shipped. Warehouse stock reduced and dispatch marked Dispatched.');
      } else {
        await api.put(`/admin/receipt-issue/${receiptIssueModal._id}/approve`, {
          adminNotes: receiptIssueForm.adminNotes,
        });
        toast.success('Replacement approved. Warehouse unchanged — ship when ready.');
      }
      setReceiptIssueModal(null);
      afterMutation();
    } catch (err) {
      toast.error(err.response?.data?.message || (receiptIssueMode === 'ship' ? 'Failed to ship replacement' : 'Failed to approve issue'));
    }
  };

  const handleAction = async (id, action) => {
    const result = await toast.approvalNotes({ action, kind: 'admin-replacement' });
    if (!result.confirmed) return;
    try {
      await api.put(`/admin/replacement/${id}/${action}`, { adminNotes: result.notes });
      if (action === 'approve') {
        toast.success('Approved — ship the replacement with a tracking ID when ready.');
      } else {
        toast.success('Replacement request rejected.');
      }
      afterMutation();
    } catch (err) { toast.error(`Failed to ${action} request`); }
  };

  const showGeneratedPassword = (password, meta) => {
    setGeneratedPassword(password);
    setPasswordMeta({
      emailSent: false,
      emailNote: null,
      entityName: '',
      credentialType: 'am',
      schoolCode: '',
      email: '',
      ...meta,
    });
    setIsPasswordModalOpen(true);
  };

  const copyPassword = async () => {
    if (!generatedPassword) return;
    try {
      await navigator.clipboard.writeText(generatedPassword);
      toast.success('Password copied');
    } catch {
      toast.error('Could not copy password');
    }
  };

  const getAMForDivision = (divisionId) => {
    if (!divisionId) return null;
    const div = data.divisions.find((d) => d._id === divisionId);
    if (div?.regionalManagerId) {
      const am = div.regionalManagerId;
      return typeof am === 'object' ? am : data.ams.find((a) => a._id === am);
    }
    return data.ams.find((a) => (a.divisionId?._id || a.divisionId) === divisionId);
  };

  const divisionsWithAM = useMemo(
    () => data.divisions.filter((d) => getAMForDivision(d._id)),
    [data.divisions, data.ams]
  );

  // --- Entity Handlers ---
  const handleSaveDivision = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: divisionForm.name,
        description: divisionForm.description,
      };
      if (divisionForm.id) {
        await api.put(`/admin/divisions/${divisionForm.id}`, payload);
        toast.success('Division updated!');
      } else {
        await api.post('/admin/divisions', payload);
        toast.success('Division created! Add an Account Manager next.');
      }
      setIsDivisionModalOpen(false);
      afterMutation();
    } catch (err) {
      const msg = err.response?.data?.message
        || (err.message === 'Network Error' ? 'Cannot reach server — make sure the backend is running on port 5000' : null)
        || 'Error saving division';
      toast.error(msg);
    }
  };

  const handleDeleteDivision = async (id) => {
    if (!(await toast.confirm('Delete this division?'))) return;
    try {
      await api.delete(`/admin/divisions/${id}`);
      toast.success('Division deleted');
      afterMutation();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete division');
    }
  };

  const handleSaveSchool = async (e) => {
    e.preventDefault();
    const payload = {
      ...schoolForm,
      name: normalizeBranchName(schoolForm.name),
      code: preserveSchoolLoginId(schoolForm.code),
      joiningYear: schoolForm.joiningYear === '' ? null : Number(schoolForm.joiningYear),
    };
    if (!payload.name) {
      toast.error('Branch name is required');
      return;
    }
    try {
       if (schoolForm.id) {
         await api.put(`/admin/schools/${schoolForm.id}`, payload);
         toast.success('School updated!');
         setIsSchoolModalOpen(false);
       } else {
         const res = await api.post('/admin/schools', payload);
         setIsSchoolModalOpen(false);
         if (res.data.generatedPassword) {
           showGeneratedPassword(res.data.generatedPassword, {
             emailSent: false,
             emailNote: null,
             entityName: formatSchoolDisplayName(res.data.school?.name || payload.name),
             schoolCode: res.data.school?.code || payload.code,
             credentialType: 'school',
           });
           toast.success('School created — copy the password from the credentials dialog');
         } else {
           toast.success('School added — add email and portal password later from the school list');
         }
       }
       afterMutation();
       loadWizklubSchools({ includeSchools: false });
       if (schoolRegistryTab === 'mapped') {
         loadWizklubRegistryPage('mapped', wizklubMappedPage);
       } else if (schoolRegistryTab === 'notMapped') {
         loadWizklubRegistryPage('not_mapped', wizklubNotMappedPage);
       }
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving School'); }
  };

  const handleUpdateSchoolIdentity = async (schoolId, { code, joiningYear }) => {
    try {
      await api.put(`/admin/schools/${schoolId}`, {
        code: preserveSchoolLoginId(code),
        joiningYear,
      });
      toast.success('School ID updated — new dispatches will use the updated format code');
      afterMutation();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update school ID');
      throw err;
    }
  };

  const handleRegenerateSchoolPassword = async (school) => {
    if (!(await toast.confirm(`Regenerate portal password for ${formatSchoolDisplayName(school.name)}?`))) return;
    try {
      const res = await api.post(`/admin/schools/${school._id}/regenerate-password`);
      showGeneratedPassword(res.data.generatedPassword, {
        emailSent: false,
        emailNote: null,
        entityName: formatSchoolDisplayName(school.name),
        schoolCode: school.code,
        credentialType: 'school',
      });
      toast.success('Password regenerated');
      afterMutation();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regenerate school password');
    }
  };

  const handleDeleteSchool = async (id) => {
    if (!(await toast.confirm('Delete this school?'))) return;
    try {
      await api.delete(`/admin/schools/${id}`);
      toast.success('School deleted');
      afterMutation();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete school');
    }
  };

  // --- Dispatch Handlers ---
  const handleCreateDispatch = async (e) => {
    e.preventDefault();
    if (dispatchSubmitting) return;
    if (hasDuplicateKitTypes(dispatchForm.items)) {
      toast.error('Each kit type can only be added once per dispatch. Remove the duplicate kit type.');
      return;
    }

    const validItems = (dispatchForm.items ?? []).filter(
      (item) => item.kit && Number(item.quantity) > 0
    );
    if (validItems.length === 0) {
      toast.error('Add at least one kit with quantity to dispatch.');
      return;
    }

    setDispatchSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('divisionId', dispatchForm.divisionId);
      formData.append('school', dispatchForm.school);
      formData.append('category', dispatchForm.category);
      formData.append('consignmentNo', dispatchForm.consignmentNo);
      formData.append(
        'items',
        JSON.stringify(validItems.map((item) => ({ kit: item.kit, quantity: Number(item.quantity) }))),
      );
      if (dispatchForm.proofPhoto) {
        formData.append('dispatchProof', dispatchForm.proofPhoto);
      }
      const res = await api.post('/admin/dispatch', formData);
      const count = res.data.itemCount || res.data.dispatches?.length || 1;
      toast.success(`Dispatch created — ${count} kit line(s). Invoice PDF is available on Incoming.`);
      setIsModalOpen(false);
      setDispatchForm(emptyDispatchForm());
      afterMutation();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create dispatch');
    } finally {
      setDispatchSubmitting(false);
    }
  };

  const handleGenerateReplacementDispatch = async (e) => {
    e.preventDefault();
    try {
      if (!replacementDispatchForm.kitId) { toast.error('Kit ID is required'); return; }
      const formData = new FormData();
      formData.append('kitId', replacementDispatchForm.kitId);
      formData.append('dispatchDetails', replacementDispatchForm.dispatchDetails || '');
      formData.append('adminNotes', replacementDispatchForm.adminNotes || '');
      if (replacementDispatchForm.reportingManager) formData.append('reportingManager', replacementDispatchForm.reportingManager);
      if (replacementDispatchForm.proofPhoto) formData.append('dispatchProof', replacementDispatchForm.proofPhoto);
      await api.put(`/admin/replacement/${replacementDispatchForm.requestId}/generate-dispatch`, formData);
      toast.success('Replacement dispatch generated successfully!');
      setIsReplacementDispatchModalOpen(false);
      afterMutation();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to generate replacement dispatch'); }
  };

  const openDispatchModal = () => {
    setDispatchForm(emptyDispatchForm());
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (location.state?.openDispatch) {
      openDispatchModal();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const openDispatchForSchool = (divisionId, schoolId) => {
    setDispatchForm({ ...emptyDispatchForm(), divisionId, school: schoolId });
    setIsModalOpen(true);
  };

  const openReplacementDispatchModal = (reqItem) => {
    const category = reqItem.type === 'Lost' ? 'Lost Dispatch' : 'Damaged Dispatch';
    setReplacementDispatchForm({
      requestId: reqItem._id, replacementId: reqItem.replacementId || '', school: reqItem.school?._id || reqItem.school,
      schoolName: formatSchoolDisplayName(reqItem.school?.name),
      kit: reqItem.kit?._id || reqItem.kit, category, quantity: reqItem.quantity || 1, reportingManager: '',
      dispatchDetails: '', kitId: '', adminNotes: reqItem.adminNotes || ''
    });
    setIsReplacementDispatchModalOpen(true);
  };

  const handleExportExcel = async () => {
    try {
      toast.info('Preparing export…');
      const allDispatches = await fetchAllPages('/admin/dispatches', {}, 50);
      if (!allDispatches.length) {
        toast.error('No registry data to export');
        return;
      }
      const exportData = allDispatches.map((d) => ({
      'Dispatch ID': d.dispatchId || '', 'Replacement ID': d.replacementId || '', 'Category': d.category || 'New Dispatch',
      'Kit ID': d.kitId || '', 'Tracking ID': d.trackingId || '', 'Authorized Date': new Date(d.createdAt).toLocaleDateString(),
      'Destination School': formatSchoolDisplayName(d.school?.name) || 'Unknown', 'Kit Assignment': d.kit?.name || 'Unknown', 'Quantity': d.quantity,
      'Assigned AM': d.reportingManager?.name || 'Unassigned', 'Status': d.status, 'Details': d.dispatchDetails || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dispatches Registry');
    XLSX.writeFile(workbook, `Dispatch_Registry_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Excel file generated successfully!');
    } catch (err) {
      toast.error('Failed to export dispatches');
    }
  };

  const openDivisionModal = (div = null) => {
    if (div) {
      setDivisionForm({
        id: div._id,
        name: div.name,
        description: div.description || '',
      });
    } else {
      setDivisionForm({ id: null, name: '', description: '' });
    }
    setIsDivisionModalOpen(true);
  };

  const handleSchoolDivisionChange = (divisionId) => {
    setSchoolForm((prev) => ({ ...prev, divisionId }));
  };

  const loadWizklubRegionMappings = async () => {
    try {
      const res = await api.get('/admin/wizklub/regions');
      setWizklubRegionMappings(res.data.divisions || []);
    } catch {
      setWizklubRegionMappings([]);
    }
  };

  const loadWizklubSchools = async ({ includeSchools = false } = {}) => {
    setWizklubSchoolsLoading(true);
    try {
      const res = await api.get('/admin/wizklub/schools', {
        params: {
          page_size: 100,
          includeSchools: includeSchools ? 'true' : 'false',
        },
      });
      applyWizklubStats(res.data);
      if (includeSchools) {
        setWizklubSchoolOptions(res.data.schools || []);
      }
      if (res.data.divisionsCreated > 0) {
        toast.success(`Added ${res.data.divisionsCreated} division(s) from WizKlub regions (assign AMs when ready)`);
        await fetchData();
        await loadWizklubRegionMappings();
      }
    } catch (err) {
      if (includeSchools) setWizklubSchoolOptions([]);
      setWizklubStats({
        total: 0, withRegionCount: 0, needsRegionCount: 0, readyToRegisterCount: 0,
        mappedCount: 0, notMappedCount: 0, pendingRegisterCount: 0,
      });
      setOperationalListStats(null);
      toast.error(err.response?.data?.message || 'Could not load schools from WizKlub');
    } finally {
      setWizklubSchoolsLoading(false);
    }
  };

  const loadWizklubRegistryPage = useCallback(async (mapping, page) => {
    setWizklubSchoolsLoading(true);
    try {
      const res = await api.get('/admin/wizklub/schools', {
        params: {
          page_size: 100,
          includeSchools: 'false',
          mapping,
          page,
          limit: WIZKLUB_PAGE_SIZE,
          ...(debouncedWizklubSearch ? { search: debouncedWizklubSearch } : {}),
          ...(wizklubListFilter !== 'all' ? { scope: wizklubListFilter } : {}),
        },
      });
      applyWizklubStats(res.data);
      const rows = res.data.data || [];
      const totalFiltered = res.data.totalFiltered ?? rows.length;
      const totalPages = res.data.totalPages ?? 1;
      const currentPage = res.data.page ?? page;

      if (mapping === 'mapped') {
        setWizklubMappedItems(rows);
        setWizklubMappedTotal(totalFiltered);
        setWizklubMappedTotalPages(totalPages);
        setWizklubMappedPage(currentPage);
      } else {
        setWizklubNotMappedItems(rows);
        setWizklubNotMappedTotal(totalFiltered);
        setWizklubNotMappedTotalPages(totalPages);
        setWizklubNotMappedPage(currentPage);
      }
    } catch (err) {
      if (mapping === 'mapped') {
        setWizklubMappedItems([]);
        setWizklubMappedTotal(0);
        setWizklubMappedTotalPages(1);
      } else {
        setWizklubNotMappedItems([]);
        setWizklubNotMappedTotal(0);
        setWizklubNotMappedTotalPages(1);
      }
      toast.error(err.response?.data?.message || 'Could not load WizKlub schools');
    } finally {
      setWizklubSchoolsLoading(false);
    }
  }, [applyWizklubStats, debouncedWizklubSearch, wizklubListFilter]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedWizklubSearch(wizklubCatalogSearch.trim()), 350);
    return () => clearTimeout(timer);
  }, [wizklubCatalogSearch]);

  useEffect(() => {
    setWizklubListFilter('all');
    setWizklubCatalogSearch('');
  }, [schoolRegistryTab]);

  useEffect(() => {
    setWizklubMappedPage(1);
    setWizklubNotMappedPage(1);
  }, [debouncedWizklubSearch, wizklubListFilter]);

  useEffect(() => {
    if (activeView !== 'schools') return;
    loadWizklubSchools({ includeSchools: false });
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'schools' || schoolRegistryTab !== 'mapped') return;
    loadWizklubRegistryPage('mapped', wizklubMappedPage);
  }, [activeView, schoolRegistryTab, wizklubMappedPage, loadWizklubRegistryPage]);

  useEffect(() => {
    if (activeView !== 'schools' || schoolRegistryTab !== 'notMapped') return;
    loadWizklubRegistryPage('not_mapped', wizklubNotMappedPage);
  }, [activeView, schoolRegistryTab, wizklubNotMappedPage, loadWizklubRegistryPage]);

  const handleSyncWizklubRegions = async () => {
    if (!(await toast.confirm('Sync WizKlub regions and create divisions for any unmapped regions?'))) return;
    setWizklubSyncLoading(true);
    try {
      const res = await api.post('/admin/wizklub/regions/sync', { page_size: 100 });
      toast.success(res.data.message || 'Regions synced');
      await Promise.all([loadWizklubRegionMappings(), loadWizklubSchools({ includeSchools: false }), fetchData()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to sync WizKlub regions');
    } finally {
      setWizklubSyncLoading(false);
    }
  };

  const handleSyncOperationalAms = async () => {
    if (!(await toast.confirm(
      'Create the 4 operational Account Managers (if missing) and link each division to the correct AM from your spreadsheet? Existing AM users are reused by email.',
    ))) return;
    setWizklubAmSyncLoading(true);
    setWizklubAmSyncReport(null);
    try {
      const res = await api.post('/admin/wizklub/ams/sync-operational');
      setWizklubAmSyncReport(res.data);
      toast.success(res.data.message || 'Account Managers synced');
      if (res.data.amUsersCreated?.length > 0) {
        toast.info(`${res.data.amUsersCreated.length} new AM account(s) created. Regenerate passwords under Account Managers to email credentials.`);
      }
      await Promise.all([fetchData(), loadWizklubSchools({ includeSchools: false })]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to sync Account Managers');
    } finally {
      setWizklubAmSyncLoading(false);
    }
  };

  const handleBulkRegisterAll = async () => {
    if (wizklubMappedPendingCount === 0) {
      toast.error('All schools with region are already registered');
      return;
    }
    const skipNote = wizklubStats.readyToRegisterCount < wizklubMappedPendingCount
      ? ` Schools without email will be added without portal credentials — add email and password later.`
      : '';
    if (!(await toast.confirm(`Register all ${wizklubMappedPendingCount} mapped school(s)?${skipNote}`))) return;
    setWizklubBulkLoading(true);
    setWizklubBulkReport(null);
    try {
      const res = await api.post('/admin/wizklub/schools/register-with-region', {
        registerAllWithRegion: true,
        page_size: 100,
      });
      setWizklubBulkReport(res.data.report || null);
      toast.success(res.data.message || 'Bulk registration complete');
      afterMutation();
      await loadWizklubSchools({ includeSchools: false });
      if (schoolRegistryTab === 'mapped') {
        await loadWizklubRegistryPage('mapped', wizklubMappedPage);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk registration failed');
    } finally {
      setWizklubBulkLoading(false);
    }
  };

  const applyWizklubSchoolToForm = (picked, manualDivisionId = '') => {
    if (!picked) return;
    const divisionId = manualDivisionId
      || (picked.suggestedDivisionId ? picked.suggestedDivisionId : '');
    setSchoolForm((prev) => ({
      ...prev,
      code: preserveSchoolLoginId(picked.code || picked.id || prev.code),
      name: normalizeBranchName(picked.name) || prev.name,
      contactEmail: picked.email || prev.contactEmail,
      divisionId: divisionId || prev.divisionId,
      wizklubSchoolId: String(picked.id || picked.code || ''),
      wizklubRegionId: picked.region_id ?? null,
      wizklubRegionName: picked.region || '',
    }));
  };

  const handleWizklubSchoolPick = (key) => {
    setSelectedWizklubSchoolKey(key);
    if (!key) return;
    const picked = wizklubSchoolOptions.find(
      (school) => String(school.code || school.id) === key,
    );
    applyWizklubSchoolToForm(picked);
  };

  const openSchoolModalFromWizklub = (school, manualDivisionId = '') => {
    if (school.alreadyRegistered) {
      const registered = schoolsRegistry.items.find(
        (row) => String(row.code).toLowerCase() === String(school.code || school.id).toLowerCase(),
      );
      if (registered) {
        openSchoolModal(registered);
        return;
      }
    }

    setSchoolForm({
      id: null, name: '', code: '', joiningYear: '', divisionId: '', contactEmail: '',
      wizklubSchoolId: '', wizklubRegionId: null, wizklubRegionName: '',
    });
    setSelectedWizklubSchoolKey(String(school.code || school.id));
    if (!wizklubSchoolOptions.length) {
      setWizklubSchoolOptions([school]);
    }
    applyWizklubSchoolToForm(school, manualDivisionId);
    setIsSchoolModalOpen(true);
  };

  const handleManualDivisionPick = (schoolKey, divisionId) => {
    setManualDivisionBySchool((prev) => ({ ...prev, [schoolKey]: divisionId }));
  };

  const registerNeedsRegionSchool = (school) => {
    const key = String(school.code || school.id);
    const divisionId = manualDivisionBySchool[key];
    if (!divisionId) {
      toast.error('Select a division before registering');
      return;
    }
    openSchoolModalFromWizklub(school, divisionId);
  };

  const openSchoolModal = (school = null) => {
    if (school) {
      const divId = school.divisionId?._id || school.divisionId || '';
      setSchoolForm({
        id: school._id,
        name: normalizeBranchName(school.name),
        code: school.code,
        joiningYear: school.joiningYear != null ? String(school.joiningYear) : '',
        divisionId: divId,
        contactEmail: school.contactEmail || '',
        wizklubSchoolId: school.wizklubSchoolId || '',
        wizklubRegionId: school.wizklubRegionId ?? null,
        wizklubRegionName: school.wizklubRegionName || '',
      });
      setSelectedWizklubSchoolKey('');
    } else {
      setSchoolForm({
        id: null, name: '', code: '', joiningYear: '', divisionId: '', contactEmail: '',
        wizklubSchoolId: '', wizklubRegionId: null, wizklubRegionName: '',
      });
      setSelectedWizklubSchoolKey('');
      loadWizklubSchools({ includeSchools: true });
    }
    setIsSchoolModalOpen(true);
  };

  useEffect(() => {
    if (activeView !== 'schools') return;
    loadWizklubRegionMappings();
  }, [activeView]);

  const openSchoolAuditHistory = async (school) => {
    setSelectedSchool(school);
    setIsAuditModalOpen(true);
    setSchoolAuditsLoading(true);
    setSchoolAudits([]);
    try {
      const audits = await fetchAllPages('/admin/audits', { schoolId: school._id });
      setSchoolAudits(audits);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load school audit history');
    } finally {
      setSchoolAuditsLoading(false);
    }
  };

  // Derivations
  const activeAudit = schoolAudits[0];
  const schoolRequests = selectedSchool ? data.requests.filter(r => (r.school?._id || r.school) === selectedSchool._id) : [];

  let kitStatusContent = null;
  if (selectedSchool && isKitStatusModalOpen) {
    if (activeAudit) {
       let totalExpected = 0; let totalDamaged = 0; let totalLost = 0;
       activeAudit.items.forEach(item => { totalExpected += item.expectedQuantity; totalDamaged += item.damagedQuantity; totalLost += item.lostQuantity; });
       const pieData = [
         { name: 'Sent / Healthy', value: totalExpected - totalDamaged - totalLost },
         { name: 'Damaged', value: totalDamaged },
         { name: 'Lost', value: totalLost }
       ].filter(d => d.value > 0);

       kitStatusContent = (
         <div className="flex flex-col items-center">
           <h3 className="text-lg font-bold text-slate-800 mb-2">Inventory Status (Based on Latest Audit)</h3>
           <Badge type={activeAudit.status === 'Mismatch' ? 'error' : 'success'}>Month: {activeAudit.month}</Badge>
           <div className="h-64 w-full mt-4">
             {pieData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.name === 'Sent / Healthy' ? '#34D399' : entry.name === 'Damaged' ? '#F87171' : '#FBBF24'} />))}</Pie><Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} /><Legend verticalAlign="bottom" height={36} iconType="circle" /></PieChart>
               </ResponsiveContainer>
             ) : <p className="text-center text-slate-500 mt-10">No kit data found.</p>}
           </div>
           <div className="grid grid-cols-3 gap-4 mt-6 w-full text-center">
             <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg"><p className="text-xs text-emerald-600 font-bold">Sent</p><p className="text-xl font-extrabold text-emerald-700">{totalExpected}</p></div>
             <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg"><p className="text-xs text-amber-600 font-bold">Lost</p><p className="text-xl font-extrabold text-amber-700">{totalLost}</p></div>
             <div className="bg-red-50 border border-red-100 p-3 rounded-lg"><p className="text-xs text-red-600 font-bold">Damaged</p><p className="text-xl font-extrabold text-red-700">{totalDamaged}</p></div>
           </div>
         </div>
       );
    } else {
       const schoolDispatches = [];
       const totalSent = schoolDispatches.reduce((acc, d) => acc + d.quantity, 0);
       kitStatusContent = (
         <div className="text-center py-10">
           <p className="text-slate-500 mb-2">No audits submitted yet for this school.</p>
           <div className="bg-brand-primary/10 border border-brand-primary/20 p-6 rounded-xl inline-block mt-4"><h3 className="text-md font-semibold text-brand-primary mb-1">Total Kits Dispatched</h3><p className="text-4xl font-black text-brand-primary drop-shadow-sm">{totalSent}</p></div>
         </div>
       );
    }
  }

  if (activeView === 'invalid') {
    return <Navigate to={ROUTES.admin.overview} replace />;
  }

  if (activeView === 'replacements' && location.pathname.startsWith(`${ROUTES.admin.replacements}/`) && !replacementCategory) {
    return <Navigate to={ROUTES.admin.replacements} replace />;
  }

  if (location.pathname.startsWith(`${ROUTES.admin.audits}/`) && activeView !== 'auditReview') {
    return <Navigate to={ROUTES.admin.audits} replace />;
  }

  if (!loading && activeView === 'dispatches' && dispatchNav.step === 'schools' && !selectedDispatchDivision) {
    return <Navigate to={ROUTES.admin.dispatches} replace />;
  }

  const replacementDetailCopy = {
    missing: {
      title: 'Missing product / not received',
      subtitle: 'Normal dispatch — approve first, then ship replacements for missing kits or shipments not received.',
    },
    lost: {
      title: 'Lost product',
      subtitle: 'Monthly audit — review quantities or dispatch lost kit replacements.',
    },
    damaged: {
      title: 'Damaged product',
      subtitle: 'Normal dispatch or monthly audit — approve or ship damaged replacements.',
    },
    mismatch: {
      title: 'Quantity mismatch',
      subtitle: 'Normal dispatch — approve, then ship replacements for quantity mismatch issues.',
    },
  };

  const headerCopy = isReplacementDetail
    ? replacementDetailCopy[replacementCategory]
    : activeView === 'dispatches' && dispatchNav.step === 'school' && selectedDispatchSchool
      ? {
          title: formatSchoolDisplayName(selectedDispatchSchool.name),
          subtitle: `${selectedDispatchDivision?.name || 'Division'} — view dispatches or create a new shipment.`,
        }
      : activeView === 'dispatches' && dispatchNav.step === 'schools' && selectedDispatchDivision
        ? {
            title: selectedDispatchDivision.name,
            subtitle: 'Select a school to view its dispatches or create a new shipment.',
          }
        : ADMIN_HEADER_COPY[activeView];

  if (loading) return (
    <div className="space-y-6">
      <div className="flex justify-between items-end mb-8"><SkeletonLoader className="w-64 h-10" /> <SkeletonLoader className="w-80 h-10" /></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6"><SkeletonLoader className="h-32" /><SkeletonLoader className="h-32" /><SkeletonLoader className="h-32" /><SkeletonLoader className="h-32" /></div>
      <SkeletonLoader className="h-96" />
    </div>
  );

  return (
    <div className="animate-fade-in">
      {activeView !== 'overview' && (
        <PageHeader
          title={headerCopy.title}
          subtitle={headerCopy.subtitle}
          action={
            activeView === 'schools' ? (
              <button type="button" onClick={() => openSchoolModal()} className="stitch-btn-primary">
                + Add School
              </button>
            ) : activeView === 'divisions' ? (
              <Button onClick={() => openDivisionModal()} variant="gradient">
                + Add Division
              </Button>
            ) : activeView === 'dispatches' && (
              <Button onClick={openDispatchModal} variant="gradient">
                + New Dispatch
              </Button>
            )
          }
        />
      )}

      {activeView === 'overview' && (
        <>
          <PageHeader
            eyebrow={`Hello ${adminDisplayName}`}
            title="System Overview"
            subtitle="Action queues first, then this month’s operations, then live current state."
            action={
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Status:</span>
                <div className="flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 shadow-sm">
                  <span className={`h-2 w-2 rounded-full ${metrics.pendingAdminApprovals > 0 ? 'bg-[#F59E0B]' : 'bg-[#22C55E]'} animate-pulse`} />
                  <span className="text-[11px] font-semibold text-[#1F2937]">
                    {metrics.pendingAdminApprovals > 0 ? 'Needs attention' : 'Optimal'}
                  </span>
                </div>
              </div>
            }
          />

          {metrics.pendingAdminApprovals > 0 && (
            <Card className={`mb-6 border-l-4 border-l-warning-500 bg-warning-50/40 ${metrics.pendingReceiptIssues > 0 ? 'approval-section-pending' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-warning-800">
                    {metrics.pendingAdminApprovals} approval{metrics.pendingAdminApprovals === 1 ? '' : 's'} waiting after AM review
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {metrics.pendingReceiptIssues > 0 && `${metrics.pendingReceiptIssues} receipt issue(s) from dispatch reports. `}
                    {metrics.pendingReplacementRequests > 0 && `${metrics.pendingReplacementRequests} replacement request(s).`}
                    {' '}Approve first, then ship replacements with a tracking ID.
                  </p>
                </div>
                <Button variant="gradient" className="text-sm" onClick={() => navigate(ROUTES.admin.replacements)}>
                  Review approvals
                </Button>
              </div>
            </Card>
          )}

          <AttentionQueues
            className="mb-5"
            queues={opsData?.attention?.queues}
            loading={opsLoading}
          />

          <AdminOperationsBoard
            className="mb-5"
            month={opsData?.month}
            period={opsData?.period}
            current={opsData?.current}
            loading={opsLoading}
            clickable
          />

          <div className="command-deep-shadow relative mb-5 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 md:p-6">
            <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-bl-full bg-[#F89C28]/5" />

            <div className="relative z-10 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
              <StatCard label="Total Schools" value={metrics.totalSchools} accent="primary" icon={Building2} />
              <StatCard label="Warehouse Stock" value={data.warehouseTotal || metrics.warehouseStock || 0} hint="Units in global warehouse" accent="blue" icon={Package} />
              <StatCard label="Active Inventory" value={metrics.activeInventory} hint="Units received at schools" accent="success" icon={Boxes} />
              <StatCard label="Missing Inventory" value={metrics.missingInventory} hint="Lost units from audits" accent="error" icon={AlertTriangle} />
              <StatCard label="Pending Audits" value={metrics.pendingAudits} hint="Schools without this month" accent="warning" icon={ClipboardList} />
            </div>

            <LifecycleStrip />
          </div>

          <div className="mb-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
            <div className="xl:col-span-12">
              <ModuleQuickLink metrics={metrics} />
            </div>
          </div>
        </>
      )}

      {(activeView === 'warehouse' || activeView === 'inventory') && (
        <AdminKitManager onRefresh={afterMutation} />
      )}

      {activeView === 'dispatches' && dispatchNav.step === 'divisions' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {productionDivisions.map((division) => {
            const schoolCount = schoolCountByDivision[division._id] || 0;
            const dispatchCount = dispatchCountByDivision[division._id] || 0;
            const am = getAMForDivision(division._id);
            return (
              <button
                key={division._id}
                type="button"
                onClick={() => navigate(ROUTES.admin.dispatchesDivision(division._id))}
                className="text-left w-full rounded-xl border bg-white shadow-sm transition-all duration-200 border-t-[3px] border-t-brand-primary p-4 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
                    <Building2 size={18} strokeWidth={2} />
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Dispatches</p>
                    <span className={`text-lg font-extrabold ${dispatchCount > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                      {dispatchCount}
                    </span>
                  </div>
                </div>
                <h3 className="text-sm font-bold text-slate-900 leading-snug">{division.name}</h3>
                {division.description && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{division.description}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3 text-xs font-semibold text-slate-600">
                  <span className="bg-slate-100 px-2 py-1 rounded inline-flex items-center gap-1">
                    <GraduationCap size={12} />
                    {schoolCount} school{schoolCount === 1 ? '' : 's'}
                  </span>
                  {am && (
                    <span className="bg-slate-100 px-2 py-1 rounded inline-flex items-center gap-1">
                      <Users size={12} />
                      {am.name}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {productionDivisions.length === 0 && (
            <p className="col-span-full text-center text-slate-500 py-10">No divisions yet. Add a division to start dispatching.</p>
          )}
        </div>
      )}

      {activeView === 'dispatches' && dispatchNav.step === 'schools' && selectedDispatchDivision && (
        <>
          <Button
            variant="outline"
            className="mb-6 text-sm"
            onClick={() => navigate(ROUTES.admin.dispatches)}
          >
            <ArrowLeft size={16} className="mr-2" />
            All divisions
          </Button>
          <ListToolbar
            search={divisionSchoolsList.search}
            onSearchChange={divisionSchoolsList.setSearch}
            searchPlaceholder="Search schools by name or code…"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {divisionSchoolsList.items.map((school) => (
              <Card key={school._id} className="flex flex-col shadow-sm">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">{formatSchoolDisplayName(school.name)}</h3>
                  <div className="mt-2">
                    <SchoolIdentityEditor
                      school={school}
                      onSave={(updates) => handleUpdateSchoolIdentity(school._id, updates)}
                      compact
                    />
                  </div>
                  <p className="text-xs font-semibold text-brand-primary mt-3">
                    {school.dispatchCount || 0} dispatch{(school.dispatchCount || 0) === 1 ? '' : 'es'}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-auto">
                  <Button
                    variant="outline"
                    className="text-xs py-2"
                    onClick={() => navigate(ROUTES.admin.dispatchesSchool(dispatchNav.divisionId, school._id))}
                  >
                    View dispatches
                  </Button>
                  <Button
                    variant="gradient"
                    className="text-xs py-2"
                    onClick={() => openDispatchForSchool(dispatchNav.divisionId, school._id)}
                  >
                    Create dispatch
                  </Button>
                </div>
              </Card>
            ))}
            {!divisionSchoolsList.loading && divisionSchoolsList.items.length === 0 && (
              <p className="col-span-full text-center text-slate-500 py-10">No schools in this division yet.</p>
            )}
          </div>
          <Pagination
            page={divisionSchoolsList.page}
            totalPages={divisionSchoolsList.totalPages}
            total={divisionSchoolsList.total}
            onPageChange={divisionSchoolsList.setPage}
          />
        </>
      )}

      {activeView === 'dispatches' && dispatchNav.step === 'school' && selectedDispatchSchool && selectedDispatchDivision && (
        <AdminSchoolDispatchHub
          school={selectedDispatchSchool}
          division={selectedDispatchDivision}
          onBack={() => navigate(ROUTES.admin.dispatchesDivision(dispatchNav.divisionId))}
          onCreateDispatch={() => openDispatchForSchool(dispatchNav.divisionId, selectedDispatchSchool._id)}
          onUpdateSchoolIdentity={handleUpdateSchoolIdentity}
        />
      )}

      {activeView === 'schools' && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 rounded-xl bg-[#F3F4F6] p-1 w-fit">
            <button
              type="button"
              onClick={() => setSchoolRegistryTab('registered')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                schoolRegistryTab === 'registered'
                  ? 'bg-white text-[#1F2937] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              Registered in inventory ({schoolsRegistry.total || schoolsRegistry.items.length})
            </button>
            <button
              type="button"
              onClick={() => setSchoolRegistryTab('mapped')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                schoolRegistryTab === 'mapped'
                  ? 'bg-white text-[#1F2937] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              Mapped ({wizklubStats.mappedCount ?? (wizklubSchoolsLoading ? '…' : 0)})
            </button>
            <button
              type="button"
              onClick={() => setSchoolRegistryTab('notMapped')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                schoolRegistryTab === 'notMapped'
                  ? 'bg-white text-[#1F2937] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              Not mapped ({wizklubStats.notMappedCount ?? (wizklubSchoolsLoading ? '…' : 0)})
            </button>
          </div>

          {(schoolRegistryTab === 'mapped' || schoolRegistryTab === 'notMapped') && (
            <div className="stitch-card flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2 text-sm text-[#6B7280]">
                <p>
                  {wizklubStats.total > 0
                    ? `${wizklubStats.mappedCount} mapped · ${wizklubStats.notMappedCount} not mapped · ${wizklubMappedPendingCount} pending registration`
                    : 'Load schools from WizKlub using your admin session.'}
                </p>
                {operationalListStats?.total > 0 && (
                  <details className="rounded-lg border border-[#3B82F6]/20 bg-[#3B82F6]/5 px-3 py-2 text-[#1F2937]">
                    <summary className="cursor-pointer font-semibold text-sm">
                      Your operational list ({operationalListStats.total} schools)
                    </summary>
                    <p className="mt-2 text-sm text-[#6B7280]">
                      {operationalListStats.mapped} mapped in WizKlub · {operationalListStats.gaps} gap(s) waiting on WizKlub.
                      {' '}
                      The &quot;Not mapped&quot; tab ({wizklubStats.notMappedCount}) is the full WizKlub catalog without a region — not the same as your 192-school list.
                      Use the filter below to show only operational schools or gaps.
                    </p>
                  </details>
                )}
                <p>Divisions and schools can be registered now. Account Managers are not created automatically — use <strong>Assign operational AMs</strong> to link divisions from your spreadsheet roster.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="text-sm"
                  disabled={wizklubAmSyncLoading || wizklubSchoolsLoading}
                  onClick={handleSyncOperationalAms}
                >
                  {wizklubAmSyncLoading ? 'Assigning AMs…' : 'Assign operational AMs'}
                </Button>
                <Button
                  variant="outline"
                  className="text-sm"
                  disabled={wizklubSyncLoading || wizklubSchoolsLoading}
                  onClick={handleSyncWizklubRegions}
                >
                  {wizklubSyncLoading ? 'Refreshing…' : 'Refresh region mappings'}
                </Button>
              </div>
            </div>
          )}

          {wizklubAmSyncReport && (schoolRegistryTab === 'mapped' || schoolRegistryTab === 'notMapped') && (
            <div className="stitch-card space-y-2 p-4 text-sm text-[#1F2937]">
              <p className="font-semibold">Account Manager sync report</p>
              <ul className="list-inside list-disc text-[#6B7280]">
                <li>Divisions linked: {wizklubAmSyncReport.divisionsAssigned?.length || 0}</li>
                <li>AM accounts created: {wizklubAmSyncReport.amUsersCreated?.length || 0}</li>
                <li>Schools updated with AM: {(wizklubAmSyncReport.schoolsUpdated || []).reduce((n, row) => n + (row.count || 0), 0)}</li>
              </ul>
            </div>
          )}

          {wizklubBulkReport && schoolRegistryTab === 'mapped' && (
            <div className="stitch-card space-y-2 p-4 text-sm text-[#1F2937]">
              <p className="font-semibold">Bulk registration report</p>
              <ul className="list-inside list-disc text-[#6B7280]">
                <li>Registered: {wizklubBulkReport.registered?.length || 0}</li>
                <li>Already registered: {wizklubBulkReport.skippedAlreadyRegistered?.length || 0}</li>
                <li>No division mapped: {wizklubBulkReport.skippedNoDivision?.length || 0}</li>
                <li>Division missing AM: {wizklubBulkReport.skippedNoAm?.length || 0}</li>
                <li>Missing email: {wizklubBulkReport.skippedNoEmail?.length || 0}</li>
                <li>Failed: {wizklubBulkReport.failed?.length || 0}</li>
              </ul>
            </div>
          )}

          {schoolRegistryTab === 'registered' && (
          <>
          <div className="stitch-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <input
                type="search"
                value={schoolsRegistry.search}
                onChange={(e) => schoolsRegistry.setSearch(e.target.value)}
                placeholder="Search schools..."
                aria-label="Search registered schools"
                className="stitch-input"
              />
            </div>
            <div className="flex min-w-[180px] flex-col gap-1">
              <label className="stitch-label" htmlFor="school-division-filter">Division</label>
              <select
                id="school-division-filter"
                className="stitch-input"
                value={schoolDivisionFilter}
                onChange={(e) => setSchoolDivisionFilter(e.target.value)}
              >
                <option value="">All divisions</option>
                {data.divisions.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <section className="stitch-card overflow-hidden">
            <div className="overflow-x-auto">
              {schoolsRegistry.items.length > 0 ? (
                <table className="w-full border-collapse text-left">
                  <thead className="stitch-table-head">
                    <tr className="border-b border-[var(--stitch-border)]">
                      {['School', 'Code', 'Division', 'Account Manager', 'Portal', 'Contact Email', 'Actions'].map((col) => (
                        <th
                          key={col}
                          className={`px-3 py-2.5 lg:px-4 ${col === 'Actions' ? 'text-right' : ''} ${
                            col === 'Code' ? 'hidden md:table-cell' : ''
                          } ${col === 'Contact Email' ? 'hidden xl:table-cell' : ''}`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {schoolsRegistry.items.map((school) => {
                      const divisionId = school.divisionId?._id || school.divisionId;
                      const am = getAMForDivision(divisionId);
                      const displayName = formatSchoolDisplayName(school.name);
                      const schoolInitials = displayName
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join('') || 'S';
                      const email = school.portalUser?.email || school.contactEmail || '—';
                      const portalStatus = school.portalUser
                        ? 'Active'
                        : (school.contactEmail ? 'No password' : 'Add email later');
                      const portalBadgeType = school.portalUser ? 'success' : (school.contactEmail ? 'warning' : 'info');
                      return (
                        <tr key={school._id} className="transition hover:bg-[#F8FAFC]">
                          <td className="px-3 py-2.5 lg:px-4">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F89C28]/10 text-xs font-bold text-[#F89C28]">
                                {schoolInitials}
                              </div>
                              <span className="truncate font-bold text-[#1F2937] min-w-[8rem]" title={displayName}>{displayName}</span>
                            </div>
                          </td>
                          <td className="hidden px-3 py-2.5 font-mono text-xs whitespace-nowrap text-[#6B7280] md:table-cell lg:px-4">{school.code}</td>
                          <td className="px-3 py-2.5 lg:px-4">
                            {school.divisionId?.name ? (
                              <span className="inline-flex rounded-full border border-[#3B82F6]/20 bg-[#3B82F6]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#3B82F6]">
                                {school.divisionId.name}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-[#1F2937] lg:px-4">
                            {am?.name || <span className="text-[#6B7280]">Assign later</span>}
                          </td>
                          <td className="px-3 py-2.5 lg:px-4">
                            <Badge type={portalBadgeType}>{portalStatus}</Badge>
                          </td>
                          <td className="hidden max-w-[16rem] truncate px-3 py-2.5 text-sm font-medium text-[#F89C28] xl:table-cell lg:px-4" title={email}>
                            {email}
                          </td>
                          <td className="px-3 py-2.5 lg:px-4">
                            <div className="flex items-center justify-end gap-1">
                              <button type="button" onClick={() => openSchoolAuditHistory(school)} className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#F89C28]/10 hover:text-[#F89C28]" aria-label="Audit history">
                                <ClipboardList size={18} />
                              </button>
                              <button type="button" onClick={() => openSchoolModal(school)} className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#F89C28]/10 hover:text-[#F89C28]" aria-label="Edit school">
                                <Pencil size={18} />
                              </button>
                              <button type="button" onClick={() => handleRegenerateSchoolPassword(school)} className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#F89C28]/10 hover:text-[#F89C28]" aria-label="Reset password">
                                <KeyRound size={18} />
                              </button>
                              <button type="button" onClick={() => handleDeleteSchool(school._id)} className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#EF4444]/10 hover:text-[#EF4444]" aria-label="Delete school">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="py-16 text-center text-[#6B7280]">
                  {schoolsRegistry.loading ? 'Loading schools…' : 'No schools found.'}
                </p>
              )}
            </div>
            <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-4">
              <Pagination
                page={schoolsRegistry.page}
                totalPages={schoolsRegistry.totalPages}
                total={schoolsRegistry.total}
                onPageChange={schoolsRegistry.setPage}
              />
            </div>
          </section>
          </>
          )}

          {schoolRegistryTab === 'mapped' && (
            <section className="stitch-card overflow-hidden">
              <div className="border-b border-[var(--stitch-border)] bg-[#F8FAFC]/50 px-6 py-4">
                <h3 className="text-lg font-semibold text-[#1F2937]">Mapped schools</h3>
                <p className="mt-1 text-sm text-[#6B7280]">
                  WizKlub region is linked to an inventory division. Register now — add AM, email, and portal password later.
                </p>
              </div>
              <div className="flex flex-col gap-3 border-b border-[var(--stitch-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={wizklubCatalogSearch}
                  onChange={(e) => setWizklubCatalogSearch(e.target.value)}
                  placeholder="Search by name, code, email, or region…"
                  aria-label="Search mapped WizKlub schools"
                  className="stitch-input max-w-xl flex-1"
                />
                  <select
                    className="stitch-input min-w-[220px] text-sm"
                    value={wizklubListFilter}
                    onChange={(e) => setWizklubListFilter(e.target.value)}
                  >
                    <option value="all">All WizKlub schools ({wizklubStats.mappedCount})</option>
                    <option value="operational">
                      Operational list ({operationalListStats?.mapped ?? '…'})
                    </option>
                  </select>
                </div>
                <Button
                  variant="gradient"
                  className="shrink-0 text-sm"
                  disabled={wizklubBulkLoading || wizklubSchoolsLoading || wizklubMappedPendingCount === 0}
                  onClick={handleBulkRegisterAll}
                >
                  {wizklubBulkLoading ? 'Registering…' : `Register all (${wizklubMappedPendingCount})`}
                </Button>
              </div>
              <div className="overflow-x-auto">
                {wizklubSchoolsLoading ? (
                  <p className="py-16 text-center text-[#6B7280]">Loading schools from WizKlub…</p>
                ) : wizklubMappedTotal > 0 ? (
                  <table className="w-full border-collapse text-left">
                    <thead className="stitch-table-head">
                      <tr className="border-b border-[var(--stitch-border)]">
                        {['School', 'Code', 'Region / Division', 'Account Manager', 'Status', 'Action'].map((col) => (
                          <th key={col} className={`px-6 py-4 ${col === 'Action' ? 'text-right' : ''}`}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {wizklubMappedItems.map((school) => {
                        const key = String(school.code || school.id);
                        const displayName = formatSchoolDisplayName(school.name || key);
                        let statusLabel = 'Pending';
                        let statusType = 'info';
                        if (school.alreadyRegistered || school.mappingStatus === 'registered') {
                          statusLabel = 'Registered';
                          statusType = 'success';
                        }
                        const amName = school.divisionAmName || school.suggestedAmName;
                        const amEmail = school.divisionAmEmail || school.suggestedAmEmail;
                        return (
                          <tr key={key} className="transition hover:bg-[#F8FAFC]">
                            <td className="px-6 py-4 font-semibold text-[#1F2937]">
                              <div className="flex flex-col gap-0.5">
                                <span>{displayName}</span>
                                {school.inOperationalList && school.operationalSchoolId && (
                                  <span className="text-[11px] font-normal text-[#6B7280]">{school.operationalSchoolId}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-[#6B7280]">{school.code || school.id || '—'}</td>
                            <td className="px-6 py-4">
                              {school.region ? (
                                <span className="inline-flex rounded-full border border-[#3B82F6]/20 bg-[#3B82F6]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#3B82F6]">
                                  {school.suggestedDivisionName || school.region}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-6 py-4 text-sm text-[#1F2937]">
                              {amName ? (
                                <div className="flex flex-col gap-0.5">
                                  <span>{amName}</span>
                                  {amEmail && (
                                    <span className="text-[11px] text-[#6B7280]">{amEmail}</span>
                                  )}
                                  {!school.divisionAmName && school.suggestedAmName && (
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]">From spreadsheet</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[#6B7280]">Assign later</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <Badge type={statusType}>{statusLabel}</Badge>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button
                                variant={school.alreadyRegistered ? 'outline' : 'gradient'}
                                className="text-xs py-1.5 px-4"
                                onClick={() => openSchoolModalFromWizklub(school)}
                              >
                                {school.alreadyRegistered ? 'Edit' : 'Register'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-16 text-center text-[#6B7280]">No mapped schools found.</p>
                )}
              </div>
              {!wizklubSchoolsLoading && wizklubMappedTotal > 0 && (
                <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-4">
                  <Pagination
                    page={wizklubMappedPage}
                    totalPages={wizklubMappedTotalPages}
                    total={wizklubMappedTotal}
                    pageSize={WIZKLUB_PAGE_SIZE}
                    onPageChange={setWizklubMappedPage}
                  />
                </div>
              )}
            </section>
          )}

          {schoolRegistryTab === 'notMapped' && (
            <section className="stitch-card overflow-hidden">
              <div className="border-b border-[var(--stitch-border)] bg-[#F8FAFC]/50 px-6 py-4">
                <h3 className="text-lg font-semibold text-[#1F2937]">Not mapped schools</h3>
                <p className="mt-1 text-sm text-[#6B7280]">
                  Missing WizKlub region or division link. Pick a division manually to register, or wait for WizKlub region data.
                </p>
              </div>
              <div className="flex flex-col gap-3 border-b border-[var(--stitch-border)] p-4 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={wizklubCatalogSearch}
                  onChange={(e) => setWizklubCatalogSearch(e.target.value)}
                  placeholder="Search by name or code…"
                  aria-label="Search not-mapped WizKlub schools"
                  className="stitch-input max-w-xl flex-1"
                />
                <select
                  className="stitch-input min-w-[240px] text-sm"
                  value={wizklubListFilter}
                  onChange={(e) => setWizklubListFilter(e.target.value)}
                  aria-label="Filter WizKlub school list"
                >
                  <option value="all">All WizKlub schools ({wizklubStats.notMappedCount})</option>
                  <option value="operational_gaps">
                    Operational gaps ({operationalListStats?.gaps ?? '…'})
                  </option>
                </select>
              </div>
              {wizklubListFilter === 'operational_gaps' && operationalListStats?.gapsNotInWizklub?.length > 0 && (
                <div className="border-b border-[var(--stitch-border)] bg-[#FEF3C7]/40 px-6 py-3 text-sm text-[#92400E]">
                  {operationalListStats.gapsNotInWizklub.length} school(s) from your operational list are not in WizKlub yet
                  ({operationalListStats.gapsNotInWizklub.map((g) => g.schoolId).slice(0, 5).join(', ')}
                  {operationalListStats.gapsNotInWizklub.length > 5 ? '…' : ''}).
                </div>
              )}
              <div className="overflow-x-auto">
                {wizklubSchoolsLoading ? (
                  <p className="py-16 text-center text-[#6B7280]">Loading schools from WizKlub…</p>
                ) : wizklubNotMappedTotal > 0 ? (
                  <table className="w-full border-collapse text-left">
                    <thead className="stitch-table-head">
                      <tr className="border-b border-[var(--stitch-border)]">
                        {['School', 'Code', 'Assign division', 'AM', 'Status', 'Action'].map((col) => (
                          <th key={col} className={`px-6 py-4 ${col === 'Action' ? 'text-right' : ''}`}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {wizklubNotMappedItems.map((school) => {
                        const key = String(school.code || school.id);
                        const displayName = formatSchoolDisplayName(school.name || key);
                        const pickedDivision = manualDivisionBySchool[key] || '';
                        const amName = school.suggestedAmName;
                        const amEmail = school.suggestedAmEmail;
                        return (
                          <tr key={key} className="transition hover:bg-[#F8FAFC]">
                            <td className="px-6 py-4 font-semibold text-[#1F2937]">
                              <div className="flex flex-col gap-0.5">
                                <span>{displayName}</span>
                                {school.inOperationalList && school.operationalSchoolId && (
                                  <span className="text-[11px] font-normal text-[#6B7280]">{school.operationalSchoolId}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-[#6B7280]">{school.code || school.id || '—'}</td>
                            <td className="px-6 py-4">
                              <select
                                className="stitch-input min-w-[180px] text-sm"
                                value={pickedDivision}
                                onChange={(e) => handleManualDivisionPick(key, e.target.value)}
                                disabled={school.alreadyRegistered}
                                aria-label={`Assign division for ${displayName}`}
                              >
                                <option value="">Select division…</option>
                                {data.divisions.map((d) => (
                                  <option key={d._id} value={d._id}>{d.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-6 py-4 text-sm text-[#1F2937]">
                              {amName ? (
                                <div className="flex flex-col gap-0.5">
                                  <span>{amName}</span>
                                  {amEmail && <span className="text-[11px] text-[#6B7280]">{amEmail}</span>}
                                </div>
                              ) : (
                                <span className="text-[#6B7280]">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <Badge type={school.alreadyRegistered ? 'success' : 'warning'}>
                                {school.alreadyRegistered
                                  ? 'Registered'
                                  : (school.inOperationalList ? `Gap · ${school.operationalStatus || 'not mapped'}` : 'Not mapped')}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button
                                variant={school.alreadyRegistered ? 'outline' : 'gradient'}
                                className="text-xs py-1.5 px-4"
                                disabled={!school.alreadyRegistered && !pickedDivision}
                                onClick={() => (
                                  school.alreadyRegistered
                                    ? openSchoolModalFromWizklub(school)
                                    : registerNeedsRegionSchool(school)
                                )}
                              >
                                {school.alreadyRegistered ? 'Edit' : 'Register'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-16 text-center text-[#6B7280]">No not-mapped schools — all WizKlub schools are linked to divisions.</p>
                )}
              </div>
              {!wizklubSchoolsLoading && wizklubNotMappedTotal > 0 && (
                <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-4">
                  <Pagination
                    page={wizklubNotMappedPage}
                    totalPages={wizklubNotMappedTotalPages}
                    total={wizklubNotMappedTotal}
                    pageSize={WIZKLUB_PAGE_SIZE}
                    onPageChange={setWizklubNotMappedPage}
                  />
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {activeView === 'auditSubmissions' && (
        <>
          <AdminAuditScheduler
            divisions={data.divisions}
            auditWindows={data.auditWindows}
            onRefresh={afterMutation}
          />
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Audits" value={auditsList.total} accent="primary" icon={ClipboardList} />
            <StatCard label="Mismatches" value={metrics.auditMismatches} accent="error" icon={AlertTriangle} />
            <StatCard label="Pending This Month" value={metrics.pendingAudits} accent="warning" icon={Package} />
          </div>
          <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#E5E7EB] px-6 py-5">
              <h3 className="font-heading text-lg font-bold text-[#1F2937]">Audit history</h3>
              <p className="mt-1 text-sm text-[#6B7280]">
                Browse audits across all previous months. Filter by school, month, status, or workflow.
              </p>
            </div>
            <div className="px-6 pt-4">
              <ListToolbar
                search={auditsList.search}
                onSearchChange={auditsList.setSearch}
                searchPlaceholder="Search by school name or code…"
                filters={(
                  <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
                    <div className="flex min-w-[180px] flex-col gap-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]" htmlFor="audit-school-filter">School</label>
                      <select id="audit-school-filter" className="saas-input" value={auditSchoolFilter} onChange={(e) => setAuditSchoolFilter(e.target.value)}>
                        <option value="">All schools</option>
                        {auditSchoolOptions.map((school) => (
                          <option key={school._id} value={school._id}>
                            {formatSchoolDisplayName(school.name)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex min-w-[140px] flex-col gap-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]" htmlFor="audit-status-filter">Status</label>
                      <select id="audit-status-filter" className="saas-input" value={auditStatusFilter} onChange={(e) => setAuditStatusFilter(e.target.value)}>
                        <option value="All">All</option>
                        <option value="Normal">Normal</option>
                        <option value="Mismatch">Mismatch</option>
                      </select>
                    </div>
                    <div className="flex min-w-[160px] flex-col gap-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]" htmlFor="audit-month-filter">Month</label>
                      <input
                        id="audit-month-filter"
                        type="month"
                        className="saas-input"
                        value={auditMonthFilter}
                        onChange={(e) => setAuditMonthFilter(e.target.value)}
                      />
                    </div>
                    <div className="flex min-w-[180px] flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]" htmlFor="audit-workflow-filter">Workflow</label>
                      <select id="audit-workflow-filter" className="saas-input" value={auditWorkflowFilter} onChange={(e) => setAuditWorkflowFilter(e.target.value)}>
                        <option value="All">All</option>
                        <option value="Pending AM Approval">Pending AM Approval</option>
                        <option value="Pending Admin Approval">Pending Admin Approval</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>
                  </div>
                )}
              />
            </div>
            <div className="overflow-x-auto">
              {auditsList.items.length > 0 ? (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                      {['School', 'Month', 'Variance', 'Workflow', 'Submitted', 'Action'].map((col) => (
                        <th
                          key={col}
                          className={`px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] ${
                            col === 'Action' ? 'text-right' : ''
                          }`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {auditsList.items.map((audit) => (
                      <tr key={audit._id} className={`transition hover:bg-[#F8FAFC] ${audit.status === 'Mismatch' ? 'bg-[#EF4444]/5' : ''}`}>
                        <td className="px-6 py-3.5 font-bold text-[#1F2937]">{formatSchoolDisplayName(audit.school?.name)}</td>
                        <td className="px-6 py-3.5 text-sm text-[#6B7280]">{formatAuditMonthLabel(audit.month)}</td>
                        <td className="px-6 py-3.5"><Badge type={audit.status === 'Mismatch' ? 'error' : 'success'}>{audit.status}</Badge></td>
                        <td className="px-6 py-3.5">
                          <Badge type={
                            audit.workflowStatus === 'Approved' ? 'success'
                              : audit.workflowStatus === 'Rejected' ? 'error'
                                : audit.workflowStatus === 'Pending Admin Approval' ? 'pending' : 'warning'
                          }>
                            {audit.workflowStatus || 'Pending AM Approval'}
                          </Badge>
                        </td>
                        <td className="px-6 py-3.5 text-sm text-[#6B7280]">{new Date(audit.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-3.5 text-right">
                          <button
                            type="button"
                            className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-bold text-[#1F2937] transition hover:border-[#F89C28] hover:text-[#F89C28]"
                            onClick={() => openAuditReview(audit, true)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="py-16 text-center text-[#6B7280]">
                  {auditsList.loading ? 'Loading audits…' : 'No audit submissions found.'}
                </p>
              )}
            </div>
            <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-4">
              <Pagination
                page={auditsList.page}
                totalPages={auditsList.totalPages}
                total={auditsList.total}
                onPageChange={auditsList.setPage}
              />
            </div>
          </section>
        </>
      )}

      {activeView === 'auditReview' && (
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-2xl border border-[#F89C28]/20 bg-[#F89C28]/5 px-5 py-4 text-sm text-[#6B7280]">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F89C28]/15 text-xs font-bold text-[#F89C28]">i</span>
            <p>
              Review AM-approved monthly audits here. Approve reported quantities, then dispatch lost/damaged replacements.
              For normal dispatch receipt issues, use{' '}
              <button type="button" className="font-semibold text-[#F89C28] hover:underline" onClick={() => navigate(ROUTES.admin.replacements)}>
                Replacements
              </button>.
            </p>
          </div>

          <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E7EB] px-6 py-5">
              <div>
                <h3 className="font-heading text-lg font-bold text-[#1F2937]">Pending quantity review</h3>
                <p className="mt-1 text-sm text-[#6B7280]">AM-approved audits awaiting admin sign-off.</p>
              </div>
              <span className="rounded-full bg-[#F89C28]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#F89C28]">
                {pendingAdminAudits.length} pending
              </span>
            </div>
            <AdminAuditReviewTable
              audits={pendingAdminAudits}
              onReview={(audit) => openAuditReview(audit, false)}
              emptyTitle="Everything's up to date"
              emptyMessage="No audits pending admin approval at this moment. You'll be notified when new items arrive."
            />
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E7EB] px-6 py-5">
              <div>
                <h3 className="font-heading text-lg font-bold text-[#1F2937]">Approved — dispatch replacements</h3>
                <p className="mt-1 text-sm text-[#6B7280]">Create audit lost/damaged dispatches after quantity approval.</p>
              </div>
              <span className="rounded-full bg-[#3B82F6]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#3B82F6]">
                {approvedAuditsForDispatch.length} ready
              </span>
            </div>
            <AdminAuditReviewTable
              audits={approvedAuditsForDispatch}
              onReview={(audit) => openAuditReview(audit, false)}
              emptyTitle="Clear queue"
              emptyIcon={Truck}
              emptyMessage="No approved audits awaiting lost/damaged dispatch. All replacements are currently processed."
            />
          </section>
        </div>
      )}

      {activeView === 'replacements' && isReplacementGrid && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#F1F5F9]/80 px-5 py-4 text-sm text-[#6B7280]">
            <p>
              All replacement requests appear here from two sources:
              <span className="font-semibold text-[#1F2937]"> Monthly audit</span> (lost/damaged kits with evidence)
              and <span className="font-semibold text-[#1F2937]"> normal dispatch</span> (receipt issues after shipment).
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <AmApprovalTile
              title="Missing product"
              subtitle="Normal dispatch — missing kits or shipment not received."
              count={missingApprovalCount}
              icon={PackageX}
              onClick={() => navigate(REPLACEMENT_CATEGORY_PATHS.missing)}
              accentClass="border-t-error-500"
            />
            <AmApprovalTile
              title="Lost product"
              subtitle="Monthly audit — review or dispatch lost kits."
              count={lostApprovalCount}
              icon={PackageMinus}
              onClick={() => navigate(REPLACEMENT_CATEGORY_PATHS.lost)}
              accentClass="border-t-orange-500"
            />
            <AmApprovalTile
              title="Damaged product"
              subtitle="Normal dispatch or monthly audit — damaged kits."
              count={damagedApprovalCount}
              icon={ShieldAlert}
              onClick={() => navigate(REPLACEMENT_CATEGORY_PATHS.damaged)}
              accentClass="border-t-blue-500"
            />
            <AmApprovalTile
              title="Quantity mismatch"
              subtitle="Normal dispatch — received qty does not match shipment."
              count={quantityMismatchIssues.length}
              icon={Scale}
              onClick={() => navigate(REPLACEMENT_CATEGORY_PATHS.mismatch)}
              accentClass="border-t-amber-500"
            />
          </div>
        </div>
      )}

      {activeView === 'replacements' && isReplacementDetail && (
        <>
          <Button
            variant="outline"
            className="mb-6 text-sm"
            onClick={() => navigate(ROUTES.admin.replacements)}
          >
            <ArrowLeft size={16} className="mr-2" />
            Back to categories
          </Button>

          <ListToolbar
            search={replacementSearch}
            onSearchChange={setReplacementSearch}
            searchPlaceholder="Search school, kit, or dispatch ID…"
            className="mb-6"
          />

          {replacementCategory === 'missing' && (
            <AmApprovalSection
              title="Missing product"
              subtitle="Normal dispatch — approve first, then ship replacements for missing kits or shipments not received."
              count={missingApprovalCount}
            >
              {filteredReplacementIssues.length > 0 && (
                <>
                  <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Normal dispatch — receipt issues</p>
                  <AdminReceiptIssueTable
                    issues={filteredReplacementIssues.slice(
                      (replacementPageSafe - 1) * REPLACEMENT_PAGE_SIZE,
                      replacementPageSafe * REPLACEMENT_PAGE_SIZE,
                    )}
                    onReject={(id) => handleReceiptIssueAction(id, 'reject')}
                    onApprove={openReceiptIssueApprove}
                    onShip={openReceiptIssueShip}
                  />
                </>
              )}
              {filteredReplacementRequests.length > 0 && (
                <div className={filteredReplacementIssues.length > 0 ? 'border-t border-slate-100' : ''}>
                  {filteredReplacementIssues.length > 0 && (
                    <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Normal dispatch — replacement requests</p>
                  )}
                  <AdminReplacementRequestTable
                    requests={filteredReplacementRequests}
                    onReject={(id) => handleAction(id, 'reject')}
                    onAuthorize={openReplacementDispatchModal}
                  />
                </div>
              )}
              {replacementListTotal === 0 && (
                <p className="text-center py-10 text-slate-500">No missing product items pending admin approval.</p>
              )}
              {filteredReplacementIssues.length > REPLACEMENT_PAGE_SIZE && (
                <div className="px-5 pb-5">
                  <Pagination
                    page={replacementPageSafe}
                    totalPages={Math.max(1, Math.ceil(filteredReplacementIssues.length / REPLACEMENT_PAGE_SIZE))}
                    total={filteredReplacementIssues.length}
                    onPageChange={setReplacementPage}
                  />
                </div>
              )}
            </AmApprovalSection>
          )}

          {replacementCategory === 'lost' && (
            <AmApprovalSection
              title="Lost product"
              subtitle="Monthly audit — review quantities or dispatch lost kit replacements."
              count={lostApprovalCount}
            >
              {pendingAuditLostReviewCount > 0 && (
                <>
                  <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Monthly audit — pending quantity review</p>
                  <AdminAuditReplacementList
                    audits={pendingAdminAudits}
                    lineType="lost"
                    mode="pendingReview"
                    onReview={(audit) => openAuditReview(audit, false)}
                    emptyMessage="No lost kits pending admin review."
                  />
                </>
              )}
              {pendingAuditLostDispatchCount > 0 && (
                <div className={pendingAuditLostReviewCount > 0 ? 'border-t border-slate-100' : ''}>
                  {pendingAuditLostReviewCount > 0 && (
                    <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Monthly audit — pending dispatch</p>
                  )}
                  <AdminAuditReplacementList
                    audits={approvedAuditsForDispatch}
                    lineType="lost"
                    mode="dispatch"
                    onReview={(audit) => openAuditReview(audit, false)}
                    emptyMessage="No lost kits awaiting dispatch."
                  />
                </div>
              )}
              {lostApprovalCount === 0 && (
                <p className="text-center py-10 text-slate-500">No lost product items from monthly audit.</p>
              )}
            </AmApprovalSection>
          )}

          {replacementCategory === 'damaged' && (
            <AmApprovalSection
              title="Damaged product"
              subtitle="Normal dispatch or monthly audit — approve or ship damaged replacements."
              count={damagedApprovalCount}
            >
              {pendingAuditDamagedReviewCount > 0 && (
                <>
                  <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Monthly audit — pending quantity review</p>
                  <AdminAuditReplacementList
                    audits={pendingAdminAudits}
                    lineType="damaged"
                    mode="pendingReview"
                    onReview={(audit) => openAuditReview(audit, false)}
                    emptyMessage="No damaged kits pending admin review."
                  />
                </>
              )}
              {pendingAuditDamagedDispatchCount > 0 && (
                <div className={pendingAuditDamagedReviewCount > 0 ? 'border-t border-slate-100' : ''}>
                  {pendingAuditDamagedReviewCount > 0 && (
                    <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Monthly audit — pending dispatch</p>
                  )}
                  <AdminAuditReplacementList
                    audits={approvedAuditsForDispatch}
                    lineType="damaged"
                    mode="dispatch"
                    onReview={(audit) => openAuditReview(audit, false)}
                    emptyMessage="No damaged kits awaiting dispatch."
                  />
                </div>
              )}
              {damagedProductIssues.length > 0 && (
                <div className={(pendingAuditDamagedReviewCount > 0 || pendingAuditDamagedDispatchCount > 0) ? 'border-t border-slate-100' : ''}>
                  {(pendingAuditDamagedReviewCount > 0 || pendingAuditDamagedDispatchCount > 0) && (
                    <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Normal dispatch — receipt issues</p>
                  )}
                  <AdminReceiptIssueTable
                    issues={filteredReplacementIssues.slice(
                      (replacementPageSafe - 1) * REPLACEMENT_PAGE_SIZE,
                      replacementPageSafe * REPLACEMENT_PAGE_SIZE,
                    )}
                    onReject={(id) => handleReceiptIssueAction(id, 'reject')}
                    onApprove={openReceiptIssueApprove}
                    onShip={openReceiptIssueShip}
                  />
                </div>
              )}
              {damagedApprovalCount === 0 && (
                <p className="text-center py-10 text-slate-500">No damaged product items pending.</p>
              )}
              {filteredReplacementIssues.length > REPLACEMENT_PAGE_SIZE && (
                <div className="px-5 pb-5">
                  <Pagination
                    page={replacementPageSafe}
                    totalPages={replacementTotalPages}
                    total={filteredReplacementIssues.length}
                    onPageChange={setReplacementPage}
                  />
                </div>
              )}
            </AmApprovalSection>
          )}

          {replacementCategory === 'mismatch' && (
            <AmApprovalSection
              title="Quantity mismatch"
              subtitle="Normal dispatch — approve, then ship replacements for quantity mismatch issues."
              count={quantityMismatchIssues.length}
            >
              <AdminReceiptIssueTable
                issues={filteredReplacementIssues.slice(
                  (replacementPageSafe - 1) * REPLACEMENT_PAGE_SIZE,
                  replacementPageSafe * REPLACEMENT_PAGE_SIZE,
                )}
                onReject={(id) => handleReceiptIssueAction(id, 'reject')}
                onApprove={openReceiptIssueApprove}
                    onShip={openReceiptIssueShip}
              />
              {filteredReplacementIssues.length > REPLACEMENT_PAGE_SIZE && (
                <div className="px-5 pb-5">
                  <Pagination
                    page={replacementPageSafe}
                    totalPages={replacementTotalPages}
                    total={filteredReplacementIssues.length}
                    onPageChange={setReplacementPage}
                  />
                </div>
              )}
            </AmApprovalSection>
          )}
        </>
      )}

      {activeView === 'divisions' && (
        productionDivisions.length > 0 ? (
          <Card noPadding variant="frosted">
            <div className="border-b border-slate-200 px-6 py-4">
              <p className="text-sm text-slate-600">
                Divisions sync from WizKlub regions automatically. Account Managers are not added until you run
                {' '}
                <strong>Assign operational AMs</strong>
                {' '}
                on the Schools page (or add them manually under Account Managers).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="clean-table m-0">
                <thead>
                  <tr>
                    <th>Division</th>
                    <th>WizKlub Region</th>
                    <th>Region ID</th>
                    <th>Schools</th>
                    <th>Account Manager</th>
                    <th className="table-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {productionDivisions.map((d) => {
                    const am = getAMForDivision(d._id);
                    const schoolCount = schoolCountByDivision[d._id] || 0;
                    return (
                      <tr key={d._id}>
                        <td>
                          <p className="text-sm font-semibold text-slate-800">{d.name}</p>
                          {d.description && <p className="text-xs text-slate-500 mt-0.5">{d.description}</p>}
                        </td>
                        <td className="text-sm text-slate-700">
                          {d.wizklubRegionName ? (
                            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-700">
                              {d.wizklubRegionName}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="text-sm font-mono text-slate-600">{d.wizklubRegionId ?? '—'}</td>
                        <td className="text-sm font-semibold text-slate-800">{schoolCount}</td>
                        <td className="text-sm">
                          {am ? (
                            <span className="font-semibold text-slate-800">{am.name}</span>
                          ) : (
                            <Badge type="warning">Assign later</Badge>
                          )}
                        </td>
                        <td className="table-actions-col">
                          <div className="table-actions-row">
                            <IconActionButton
                              icon={Pencil}
                              label="Edit division"
                              variant="outline"
                              onClick={() => openDivisionModal(d)}
                            />
                            <IconActionButton
                              icon={Trash2}
                              label="Delete division"
                              variant="danger"
                              onClick={() => handleDeleteDivision(d._id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <p className="text-slate-500 glass-card p-8 text-center">No divisions yet. They are created automatically when WizKlub schools are loaded.</p>
        )
      )}

      {activeView === 'accountManagers' && (
        <AdminAccountManagers
          ams={data.ams}
          divisions={data.divisions}
          schoolCountByDivision={schoolCountByDivision}
          onRefresh={afterMutation}
          onShowPassword={showGeneratedPassword}
        />
      )}

      {activeView === 'reports' && (
        <AdminReportsSection
          divisions={productionDivisions}
          registrySection={(
            <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-6 py-5">
                <h3 className="font-heading text-lg font-bold text-[#1F2937]">Global Dispatch Registry</h3>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-bold text-[#1F2937] shadow-sm transition hover:border-[#F89C28] hover:text-[#F89C28]"
                >
                  <FileDown size={14} />
                  Export to Excel
                </button>
              </div>
              <div className="px-6 pt-4">
                <ListToolbar
                  search={reportsDispatches.search}
                  onSearchChange={reportsDispatches.setSearch}
                  searchPlaceholder="Search dispatch ID, school, or tracking…"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                      {['Dispatch ID', 'Auth. Date', 'Destination', 'Kit Details', 'Qty', 'Status', 'Action'].map((col) => (
                        <th key={col} className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {reportsDispatches.items.map((d) => {
                      const canEdit = canAdminEditTracking(d);
                      const hasTracking = !!getDispatchTrackingValue(d);
                      const overdue = isTrackingOverdue(d);
                      return (
                        <tr key={d._id} className="transition hover:bg-[#F8FAFC]">
                          <td className="px-5 py-3.5">
                            <DispatchIdCell item={d} onViewHistory={() => setTrackingDispatch(d)} />
                          </td>
                          <td className="px-5 py-3.5 text-sm font-medium text-[#6B7280]">
                            {new Date(d.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-[#1F2937]">
                            {formatSchoolDisplayName(d.school?.name)}
                          </td>
                          <td className="px-5 py-3.5"><KitDetailsCell item={d} showShippedDate={false} /></td>
                          <td className="px-5 py-3.5"><QuantityCell item={d} /></td>
                          <td className="px-5 py-3.5">
                            <Badge type={d.status === 'Delivery Completed' || d.status === 'Received' || d.status === 'Completed' ? 'success' : d.status === 'Pending' ? 'pending' : d.status === 'Dispatched' ? 'info' : 'error'}>
                              {d.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-col items-start gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-bold text-[#1F2937] transition hover:border-[#F89C28] hover:text-[#F89C28]"
                                onClick={() => setTrackingDispatch(d)}
                              >
                                View
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white transition ${
                                    overdue ? 'bg-[#EF4444] hover:bg-[#DC2626]' : 'bg-[#F89C28] hover:bg-[#E88914]'
                                  }`}
                                  onClick={() => setEditTrackingDispatch(d)}
                                >
                                  {hasTracking ? 'Edit Tracking' : 'Add Tracking'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!reportsDispatches.loading && reportsDispatches.items.length === 0 && (
                      <tr>
                        <td colSpan="7" className="px-5 py-10 text-center text-[#6B7280]">No dispatches found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-[#E5E7EB] bg-[#F8FAFC]/50 px-6 py-4">
                <Pagination
                  page={reportsDispatches.page}
                  totalPages={reportsDispatches.totalPages}
                  total={reportsDispatches.total}
                  onPageChange={reportsDispatches.setPage}
                />
              </div>
            </section>
          )}
        />
      )}

      {/* --- ENTITY MODALS --- */}
      <Modal isOpen={isDivisionModalOpen} onClose={() => setIsDivisionModalOpen(false)} title={divisionForm.id ? 'Edit Division' : 'Add Division'}>
        <form onSubmit={handleSaveDivision} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Division Name</label>
            <Input value={divisionForm.name} onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })} required placeholder="e.g. North Region" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Description</label>
            <Input value={divisionForm.description} onChange={(e) => setDivisionForm({ ...divisionForm, description: e.target.value })} placeholder="Optional description..." />
          </div>
          <Button variant="gradient" type="submit" className="w-full mt-2 py-3">
            {divisionForm.id ? 'Save Changes' : 'Create Division'}
          </Button>
        </form>
      </Modal>

      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} title={`Credentials — ${passwordMeta.entityName}`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {passwordMeta.credentialType === 'school'
              ? 'School portal credentials are shown below. They are not emailed — copy them if you need to share them.'
              : passwordMeta.emailSent
                ? 'A new password has been emailed to the Account Manager. Admins can also view it anytime from the Account Managers page.'
                : passwordMeta.emailNote || 'SES email was not sent. Share these credentials manually.'}
          </p>
          {passwordMeta.credentialType === 'school' && passwordMeta.schoolCode && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">School ID (login)</label>
              <Input readOnly value={passwordMeta.schoolCode} className="font-mono" />
            </div>
          )}
          {passwordMeta.credentialType === 'am' && passwordMeta.email && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Email (login)</label>
              <Input readOnly value={passwordMeta.email} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Password</label>
            <div className="flex items-center gap-2">
              <Input readOnly value={generatedPassword || ''} className="font-mono" />
              <Button type="button" variant="secondary" onClick={copyPassword}>Copy</Button>
            </div>
          </div>
          {passwordMeta.credentialType !== 'school' && !passwordMeta.emailSent && (
            <p className="text-xs text-warning-600 bg-warning-50/80 border border-warning-100 rounded-lg p-3">
              Configure Amazon SES in the project root <code className="text-[11px]">.env</code> (SES_REGION, SES_FROM_EMAIL, AWS_NOTIF_*) to email credentials automatically.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isSchoolModalOpen}
        onClose={() => setIsSchoolModalOpen(false)}
        title={schoolForm.id ? 'Edit School' : 'Add School'}
        className="max-w-[520px] rounded-[20px]"
        bodyClassName="!p-6 space-y-5"
        footer={
          <button
            type="submit"
            form="school-form"
            className="group flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#F89C28] text-base font-bold text-white shadow-lg shadow-orange-200 transition hover:bg-[#E88914] hover:shadow-xl active:scale-[0.99]"
          >
            {schoolForm.id ? 'Save Changes' : 'Create School'}
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        }
      >
        <form id="school-form" onSubmit={handleSaveSchool} className="space-y-5">
          {!schoolForm.id && (
            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                WizKlub School
              </label>
              {wizklubSchoolsLoading ? (
                <p className="text-sm text-[#6B7280]">Loading schools from WizKlub…</p>
              ) : (
                <select
                  className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 text-sm text-[#1F2937] outline-none focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15"
                  value={selectedWizklubSchoolKey}
                  onChange={(e) => handleWizklubSchoolPick(e.target.value)}
                >
                  <option value="">Select a school from WizKlub…</option>
                  {wizklubSchoolOptions.map((school) => {
                    const key = String(school.code || school.id);
                    const label = `${school.name}${school.code ? ` (${school.code})` : ''}`;
                    return (
                      <option key={key} value={key} disabled={school.alreadyRegistered}>
                        {school.alreadyRegistered ? `${label} — already registered` : label}
                      </option>
                    );
                  })}
                </select>
              )}
              <p className="text-xs text-[#6B7280]">
                Schools are fetched from WizKlub using your admin session. Pick one to pre-fill details, or enter them manually below.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Division Mapping</label>
            <select
              className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 text-sm text-[#1F2937] outline-none focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15"
              value={schoolForm.divisionId}
              onChange={(e) => handleSchoolDivisionChange(e.target.value)}
              required
            >
              <option value="">Select Division</option>
              {data.divisions.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
            <p className="text-xs text-[#6B7280]">Account Manager can be assigned later under Divisions or Account Managers.</p>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Unique School ID</label>
            <input
              className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 text-sm text-[#1F2937] outline-none focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15"
              value={schoolForm.code}
              onChange={(e) => setSchoolForm({ ...schoolForm, code: e.target.value })}
              required
              placeholder="BENG-0010 or beng0010"
            />
            <p className="text-xs text-[#6B7280]">Used for portal login and component ID prefix (e.g. BENG-0010).</p>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Joining year</label>
            <input
              type="number"
              min={2000}
              max={2099}
              className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 text-sm text-[#1F2937] outline-none focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15"
              value={schoolForm.joiningYear}
              onChange={(e) => setSchoolForm({ ...schoolForm, joiningYear: e.target.value })}
              placeholder="2025"
            />
            <p className="text-xs text-[#6B7280]">
              Year the school joined WizKlub — appears as /25 in component IDs
              {schoolForm.code.trim() && (
                <>
                  {' '}
                  (preview:{' '}
                  <span className="font-mono font-semibold text-[#F89C28]">
                    {formatSchoolIdentityPrefix(
                      schoolForm.code,
                      schoolForm.joiningYear === '' ? null : Number(schoolForm.joiningYear),
                    )}
                  </span>
                  )
                </>
              )}
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Branch Name</label>
            <input
              className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 text-sm text-[#1F2937] outline-none focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15"
              value={schoolForm.name}
              onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })}
              required
              placeholder="Whitefield"
            />
            <p className="text-xs text-[#6B7280]">Displayed as SHREE CHAITANYA [Branch Name] across the portal.</p>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Portal Login Email (optional)</label>
            <input
              type="email"
              className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 text-sm text-[#1F2937] outline-none focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15"
              value={schoolForm.contactEmail}
              onChange={(e) => setSchoolForm({ ...schoolForm, contactEmail: e.target.value })}
              placeholder="school@example.com — add later"
            />
            <p className="text-xs text-[#6B7280]">
              Optional for now. Add email later and use Reset Password to generate portal credentials. Login ID is the Unique School ID above.
            </p>
          </div>
        </form>
      </Modal>

      {/* MODALS ALREADY CONSTRUCTED FOR DISPATCH / STATUS / REPLACEMENTS DOWN HERE... */}
      <AdminDispatchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        divisions={data.divisions}
        kits={data.kits}
        form={dispatchForm}
        setForm={setDispatchForm}
        onSubmit={handleCreateDispatch}
        submitting={dispatchSubmitting}
      />
      <AdminAuthorizeReplacementModal
        issue={receiptIssueModal}
        form={receiptIssueForm}
        setForm={setReceiptIssueForm}
        mode={receiptIssueMode}
        onClose={() => setReceiptIssueModal(null)}
        onSubmit={submitReceiptIssueApprove}
      />
      <AdminAuditReviewModal
        audit={selectedAudit}
        ams={data.ams}
        divisions={data.divisions}
        readOnly={auditModalReadOnly}
        onClose={() => {
          setSelectedAudit(null);
          setAuditModalReadOnly(false);
        }}
        onUpdated={(updated) => {
          if (updated) setSelectedAudit(updated);
          auditsList.refresh();
          loadAuditActionAudits();
          afterMutation();
        }}
      />

      <Modal isOpen={isReplacementDispatchModalOpen} onClose={() => setIsReplacementDispatchModalOpen(false)} title="Generate Replacement Dispatch"><form onSubmit={handleGenerateReplacementDispatch} className="space-y-4"><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Replacement ID</label><Input disabled value={replacementDispatchForm.replacementId || ''} /></div><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">School Destination</label><Input disabled value={replacementDispatchForm.schoolName || ''} /></div><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Kit Configuration</label><select className="saas-input" value={replacementDispatchForm.kit} disabled required>{data.kits.map(k => <option key={k._id} value={k._id}>{k.name}</option>)}</select></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Category</label><select className="saas-input" value={replacementDispatchForm.category} disabled required><option value="Lost Dispatch">Lost Dispatch</option><option value="Damaged Dispatch">Damaged Dispatch</option></select></div><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Quantity</label><Input type="number" min="1" disabled value={replacementDispatchForm.quantity} /></div></div><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Assigned AM (Optional)</label><select className="saas-input" value={replacementDispatchForm.reportingManager} onChange={e => setReplacementDispatchForm({ ...replacementDispatchForm, reportingManager: e.target.value })}><option value="">None / Auto-Assign</option>{data.ams.map((am) => <option key={am._id} value={am._id}>{am.name}</option>)}</select></div><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Kit ID (Physical)</label><Input placeholder="Enter physical kit ID" value={replacementDispatchForm.kitId} onChange={e => setReplacementDispatchForm({ ...replacementDispatchForm, kitId: e.target.value })} /></div><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Details/Tracking</label><Input placeholder="E.g. Expedited shipping req" value={replacementDispatchForm.dispatchDetails} onChange={e => setReplacementDispatchForm({ ...replacementDispatchForm, dispatchDetails: e.target.value })} /></div><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Admin Notes (Optional)</label><textarea className="saas-input min-h-[80px] resize-y" value={replacementDispatchForm.adminNotes} onChange={e => setReplacementDispatchForm({ ...replacementDispatchForm, adminNotes: e.target.value })} placeholder="Notes for the replacement approval..." /></div><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Dispatch proof photo (optional)</label><input type="file" accept="image/*" capture="environment" className="saas-input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-primary" onChange={e => setReplacementDispatchForm({ ...replacementDispatchForm, proofPhoto: e.target.files?.[0] || null })} /><p className="text-[11px] text-slate-500">Snap a photo of the package as proof. Visible to the AM and school.</p></div><div className="pt-4"><Button variant="gradient" type="submit" className="w-full text-base py-3">Generate Dispatch Directive</Button></div></form></Modal>
      <Modal
        isOpen={isAuditModalOpen}
        onClose={() => {
          setIsAuditModalOpen(false);
          setSchoolAudits([]);
        }}
        title={`Audit History | ${formatSchoolDisplayName(selectedSchool?.name)}`}
        className="max-w-4xl max-h-[85vh] overflow-y-auto"
      >
        {schoolAuditsLoading ? (
          <p className="text-center py-10 text-slate-500">Loading audit history…</p>
        ) : (
          <AuditHistoryList
            audits={schoolAudits}
            emptyMessage="No audits found for this school."
          />
        )}
      </Modal>
      <Modal isOpen={isKitStatusModalOpen} onClose={() => setIsKitStatusModalOpen(false)} title={`Kit Tracking & Status | ${formatSchoolDisplayName(selectedSchool?.name)}`} className="max-w-2xl">{kitStatusContent}</Modal>
      <Modal isOpen={isReplacementsModalOpen} onClose={() => setIsReplacementsModalOpen(false)} title={`Pending Replacements | ${selectedSchool?.name}`} className="max-w-4xl max-h-[85vh] overflow-y-auto"><div className="overflow-x-auto">{schoolRequests.length > 0 ? (<table className="clean-table w-full"><thead><tr><th>Type</th><th>Kit Details</th><th>Reasoning / Context</th><th className="text-right">Action Directives</th></tr></thead><tbody>{schoolRequests.map(req => (<tr key={req._id}><td><Badge type={req.type === 'Damaged' ? 'error' : 'pending'}>{req.type}</Badge></td><td><p className="font-bold text-slate-800 text-[13px]">{req.kit?.name}</p><p className="font-extrabold text-slate-600 mt-1 bg-slate-100 px-2 py-0.5 rounded text-[10px] border border-slate-200 inline-block uppercase tracking-wider">Qty Request: {req.quantity}</p></td><td className="max-w-[300px] whitespace-normal"><p className="text-xs text-slate-700 leading-relaxed font-medium">{req.reasonDetails}</p>{req.amNotes && <p className="text-[11px] mt-2 text-slate-600 bg-slate-50 border border-slate-100 shadow-inner-soft p-2 rounded leading-relaxed"><span className="font-bold">AM Validation:</span> {req.amNotes}</p>}</td><td className="text-right align-middle"><div className="flex justify-end gap-2 flex-col sm:flex-row"><Button variant="danger" className="text-[11px] py-1.5 px-3" onClick={() => handleAction(req._id, 'reject')}>Deny Request</Button><Button variant="gradient" className="text-[11px] py-1.5 px-3" onClick={() => { setIsReplacementsModalOpen(false); openReplacementDispatchModal(req); }}>Authorize & Dispatch</Button></div></td></tr>))}</tbody></table>) : (<div className="text-center py-12"><span className="text-5xl block mb-4">✅</span><h3 className="text-xl font-bold text-slate-800">No Pending Replacements</h3><p className="text-sm text-slate-500 mt-2">All requests for this school have been cleared and actioned.</p></div>)}</div></Modal>
      <DispatchTrackingModal
        dispatch={trackingDispatch}
        isOpen={!!trackingDispatch}
        onClose={() => setTrackingDispatch(null)}
      />
      <AdminEditTrackingModal
        dispatch={editTrackingDispatch}
        isOpen={!!editTrackingDispatch}
        submitting={trackingSubmitting}
        onClose={() => !trackingSubmitting && setEditTrackingDispatch(null)}
        onSubmit={async ({ consignmentNo }) => {
          if (!editTrackingDispatch?._id) return;
          try {
            setTrackingSubmitting(true);
            await api.patch(`/admin/dispatches/${editTrackingDispatch._id}/tracking`, { consignmentNo });
            toast.success('Tracking updated');
            setEditTrackingDispatch(null);
            reportsDispatches.refresh?.();
          } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update tracking');
          } finally {
            setTrackingSubmitting(false);
          }
        }}
      />
    </div>
  );
};

export default AdminDashboard;
